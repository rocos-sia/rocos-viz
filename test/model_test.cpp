#include "Model.h"

#include <vtkPropCollection.h>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}
void near(double actual, double expected) {
    require(std::abs(actual - expected) < 1e-8,
            "Expected " + std::to_string(expected) + ", got " + std::to_string(actual));
}
vtkMatrix4x4* matrix(vtkRenderer* renderer, int joint, bool axes = true) {
    // The trajectory is followed by a mesh actor and axes actor for each joint.
    auto* prop = vtkProp3D::SafeDownCast(renderer->GetViewProps()->GetItemAsObject(1 + 2 * joint + (axes ? 1 : 0)));
    require(prop != nullptr, "Missing joint actor");
    return prop->GetUserTransform()->GetMatrix();
}
}

int main(int argc, char** argv) {
    try {
        require(argc == 3, "Expected source directory and temporary config path");
        const std::filesystem::path source(argv[1]);
        const std::filesystem::path config(argv[2]);
        auto write = [&](const std::string& yaml) {
            std::ofstream file(config);
            file << yaml;
            require(file.good(), "Unable to write test config");
        };
        vtkNew<vtkRenderer> renderer;
        Model model;
        model.setRenderer(renderer);
        model.setTrajVisiblity(true);
        model.updateModel({}); // No model yet.
        write(R"(robot:
  - {name: base, type: fixed, translate: [1, 0, 0]}
  - {name: mount, type: fixed, translate: [0, 2, 0]}
  - {name: turn, type: revolute, angleAxis: [0, 0, 0.5], translateLink: [10, 0, 0]}
  - {name: spacer, type: fixed, translate: [1, 0, 0], angleAxis: [0, 0, 0]}
  - {name: slide, type: prismatic, angleAxis: [0.5, 0, 0]}
  - {name: follower, type: prismatic, angleAxis: [1, 0, 0], mimic: {joint: later, multiplier: -2, offset: 0.1}}
  - {name: later, type: prismatic, angleAxis: [1, 0, 0], mimic: {joint: slide, multiplier: 0.5, offset: 0.2}}
  - {name: passive, type: revolute, active: false, position: -1.5707963267948966}
  - {name: j3, type: continuous}
  - {name: j4, type: revolute}
  - {name: j5, type: revolute}
  - {name: j6, type: revolute}
  - {name: j7, type: revolute}
  - {name: tip, type: fixed, translate: [0, 0, 1]}
)");
        model.getModelFromYamlFile(config.string());
        require(model.getFreedom() == 7, "Passive joints consumed input slots");
        require(renderer->GetViewProps()->GetNumberOfItems() == 29, "Incorrect link/actor count");
        model.updateModel({std::acos(-1.0) / 2, 0.4, 0, 0, 0, 0, 0});
        near(matrix(renderer, 3)->GetElement(0, 3), 1);
        near(matrix(renderer, 3)->GetElement(1, 3), 3);
        near(matrix(renderer, 4)->GetElement(1, 3), 3.4);
        near(matrix(renderer, 5)->GetElement(1, 3), 2.7);
        near(matrix(renderer, 6)->GetElement(1, 3), 3.1);
        near(matrix(renderer, 7)->GetElement(0, 0), 1);
        near(matrix(renderer, 13)->GetElement(2, 3), 1);
        near(matrix(renderer, 2, false)->GetElement(1, 3), 12);
        // Short/non-finite input must leave the entire pose untouched; extra slots are ignored.
        model.updateModel({0});
        model.updateModel({0, std::numeric_limits<double>::quiet_NaN(), 0, 0, 0, 0, 0});
        near(matrix(renderer, 6)->GetElement(1, 3), 3.1);
        model.updateModel({std::acos(-1.0) / 2, 0.4, 0, 0, 0, 0, 0, 99});
        near(matrix(renderer, 6)->GetElement(1, 3), 3.1);

        auto reject = [&](const std::string& yaml) {
            write(yaml);
            bool rejected = false;
            try { model.getModelFromYamlFile(config.string()); }
            catch (const std::exception&) { rejected = true; }
            require(rejected, "Invalid configuration accepted");
            require(model.getFreedom() == 7, "Bad configuration replaced model");
            near(matrix(renderer, 6)->GetElement(1, 3), 3.1);
        };
        reject("robot: []");
        reject("robot: [{name: a, type: revolute, mimic: {joint: missing}}]");
        reject("robot: [{name: a, type: revolute, mimic: {joint: a}}]");
        reject("robot: [{name: a, type: revolute, mimic: {joint: b}}, {name: b, type: revolute, mimic: {joint: a}}]");
        reject("robot: [{name: a, type: fixed}, {name: a, type: fixed}]");
        reject("robot: [{name: a, type: prismatic, angleAxis: [0, 0, 0]}]");
        reject("robot: [{name: a, type: floating}]");
        reject("robot: [{name: a, type: fixed, active: true}]");
        reject("robot: [{name: a, type: revolute, active: true, mimic: {joint: a}}]");
        reject("robot: [{name: a, type: revolute, translate: [1, 2]}]");
        reject("robot: [{name: a, type: prismatic, active: false, position: .nan}]");
        std::string tooMany = "robot:\n";
        for (int i = 0; i < 8; ++i)
            tooMany += "  - {name: j" + std::to_string(i) + ", type: revolute}\n";
        reject(tooMany);

        // Reloading a smaller model must not retain old actors, transforms or bindings.
        write(R"(robot:
  - {name: base, order: 0}
  - {name: joint, order: 1}
  - {name: mimic, type: continuous, mimic: {joint: joint}}
  - {name: tip, type: fixed, translate: [1, 0, 0]}
)");
        model.getModelFromYamlFile(config.string());
        require(model.getFreedom() == 1, "Legacy type defaults failed");
        require(renderer->GetViewProps()->GetNumberOfItems() == 9, "Old actors remain after reload");
        model.updateModel({std::acos(-1.0) / 4});
        near(matrix(renderer, 3)->GetElement(0, 3), 0);
        near(matrix(renderer, 3)->GetElement(1, 3), 1);
        model.removeRobotModel();
        require(renderer->GetViewProps()->GetNumberOfItems() == 0, "Actors remain after removal");
        model.updateModel({});

        write("robot: [{name: base, type: fixed}, {name: tip, type: fixed, translate: [0, 0, 2]}]");
        model.getModelFromYamlFile(config.string());
        require(model.getFreedom() == 0, "Fixed-only model has active joints");
        near(matrix(renderer, 1)->GetElement(2, 3), 2);

        // Passive prismatic position, local origin rotation, zero multiplier and negative axis.
        write(R"(robot:
  - {name: base, type: unknown, rotate: [0, 0, 1.5707963267948966]}
  - {name: passive, type: prismatic, active: false, position: 0.3, angleAxis: [-0.5, 0, 0]}
  - {name: follower, type: prismatic, angleAxis: [0, 0, 1], mimic: {joint: passive, multiplier: 0, offset: 0.2}}
)");
        model.getModelFromYamlFile(config.string());
        require(model.getFreedom() == 0, "Passive prismatic joint consumed an input");
        near(matrix(renderer, 2)->GetElement(0, 3), 0);
        near(matrix(renderer, 2)->GetElement(1, 3), -0.3);
        near(matrix(renderer, 2)->GetElement(2, 3), 0.2);

        for (const auto& entry : std::filesystem::recursive_directory_iterator(source / "models")) {
            const auto path = entry.path();
            if (path.filename() != "config.yaml" && path.filename() != "config_backup.yaml") continue;
            const auto joints = YAML::LoadFile(path.string())["robot"];
            model.getModelFromYamlFile(path.string());
            require(model.getFreedom() == static_cast<int>(joints.size()) - 1, "Repository config joint count mismatch");
            for (size_t i = 0; i < joints.size(); ++i) {
                require(joints[i]["type"].as<std::string>() == (i == 0 ? "fixed" : "revolute"),
                        "Repository config must declare joint types: " + path.string());
                const auto mesh = path.parent_path() / joints[i]["mesh"].as<std::string>();
                require(std::filesystem::exists(mesh), "Missing mesh: " + mesh.string());
                auto* actor = vtkActor::SafeDownCast(renderer->GetViewProps()->GetItemAsObject(1 + 2 * i));
                auto* mapper = vtkPolyDataMapper::SafeDownCast(actor->GetMapper());
                require(mapper != nullptr, "Missing mesh mapper: " + mesh.string());
                mapper->Update();
                require(mapper->GetInput()->GetNumberOfCells() > 0, "Empty or unreadable mesh: " + mesh.string());
            }
        }
        std::filesystem::remove(config);
        std::cout << "Model regression checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
