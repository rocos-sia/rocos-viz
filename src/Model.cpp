/*
Copyright 2021, Yang Luo"
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

@Author
Yang Luo, PHD
Shenyang Institute of Automation, Chinese Academy of Sciences.
 email: luoyang@sia.cn
*/

#include "Model.h"

#include <iostream>
#include <string>
#include <cmath>
#include <filesystem>
#include <functional>
#include <stdexcept>
#include <unordered_map>

#include <Eigen/Geometry>



Model::Model() {
}

Model::Model(const std::string& fileName) {
    getModelFromYamlFile(fileName);
}

Model::~Model() {
}

void Model::getModelFromYamlFile(const std::string &fileName) {

    const YAML::Node config = YAML::LoadFile(fileName);
    const YAML::Node info = config["robot"];
    if (!info.IsSequence() || info.size() == 0)
        throw std::runtime_error("robot must be a non-empty sequence");

    // Parse into temporary storage so a bad configuration preserves the current model.
    std::vector<Link> links(info.size());
    std::vector<JointInput> inputs(info.size());
    std::unordered_map<std::string, size_t> names;
    int freedom = 0;
    const auto dir = std::filesystem::path(fileName).parent_path();
    auto number = [](const YAML::Node& value, double fallback) {
        const double result = value ? value.as<double>() : fallback;
        if (!std::isfinite(result))
            throw std::runtime_error("Joint values must be finite");
        return result;
    };
    auto vector3 = [&](const YAML::Node& value, const Eigen::Vector3d& fallback) -> Eigen::Vector3d {
        if (!value) return fallback;
        if (!value.IsSequence() || value.size() != 3)
            throw std::runtime_error("Transform and axis fields must contain three numbers");
        return {number(value[0], 0), number(value[1], 0), number(value[2], 0)};
    };

    for (size_t j = 0; j < info.size(); ++j) {
        const auto node = info[j];
        auto& link = links[j];
        const auto name = node["name"].as<std::string>();
        if (name.empty() || !names.emplace(name, j).second)
            throw std::runtime_error("Joint names must be non-empty and unique: " + name);
        link.setName(name);
        link.setOrder(node["order"] ? node["order"].as<int>() : static_cast<int>(j));

        // Legacy repository files omit type: base is fixed, subsequent joints rotate.
        const auto type = node["type"] ? node["type"].as<std::string>() : (j == 0 ? "fixed" : "revolute");
        if (type == "fixed" || type == "unknown") link.setType(Link::FIXED);
        else if (type == "revolute") link.setType(Link::REVOLUTE);
        else if (type == "continuous") link.setType(Link::CONTINUOUS);
        else if (type == "prismatic") link.setType(Link::PRISMATIC);
        else throw std::runtime_error("Unsupported joint type for " + name + ": " + type);

        const bool movable = link.getType() != Link::FIXED;
        const bool mimic = node["mimic"].IsDefined();
        const bool active = node["active"] ? node["active"].as<bool>() : movable && !mimic;
        if ((active && (!movable || mimic)) || (mimic && !movable))
            throw std::runtime_error("Invalid active/mimic settings for " + name);
        if (active) inputs[j].stateIndex = freedom++;
        if (freedom > 7)
            throw std::runtime_error("At most seven active joints are supported; mark passive joints with active: false or mimic");
        const double position = number(node["position"], 0.0);
        if (node["position"] && (!movable || active || mimic))
            throw std::runtime_error("position is only valid for a passive, non-mimic joint: " + name);
        link.setAngle(position);

        auto v = vector3(node["translate"], Eigen::Vector3d::Zero());
        link.setTranslate(v.x(), v.y(), v.z());
        v = vector3(node["rotate"], Eigen::Vector3d::Zero());
        link.setRotate(v.x(), v.y(), v.z());
        v = vector3(node["angleAxis"], Eigen::Vector3d::UnitZ());
        if (movable) {
            const double length = v.stableNorm();
            if (!std::isfinite(length) || length == 0.0)
                throw std::runtime_error("Moving joint axis must be non-zero: " + name);
            v /= length;
        }
        link.setAngleAxis(v.x(), v.y(), v.z());
        v = vector3(node["translateLink"], Eigen::Vector3d::Zero());
        link.setTranslateLink(v.x(), v.y(), v.z());
        v = vector3(node["rotateLink"], Eigen::Vector3d::Zero());
        link.setRotateLink(v.x(), v.y(), v.z());
    }

    for (size_t j = 0; j < info.size(); ++j) {
        const auto mimic = info[j]["mimic"];
        if (!mimic) continue;
        if (!mimic.IsMap()) throw std::runtime_error("mimic must be a mapping");
        const auto source = names.find(mimic["joint"].as<std::string>());
        if (source == names.end()) throw std::runtime_error("Unknown mimic source joint");
        if (links[source->second].getType() == Link::FIXED)
            throw std::runtime_error("mimic source must be a moving joint");
        inputs[j].mimicIndex = static_cast<int>(source->second);
        inputs[j].multiplier = number(mimic["multiplier"], 1.0);
        inputs[j].offset = number(mimic["offset"], 0.0);
    }

    std::vector<size_t> mimicOrder;
    std::vector<int> visited(info.size(), 0);
    std::function<void(size_t)> visit = [&](size_t j) {
        if (visited[j] == 1) throw std::runtime_error("Cyclic mimic dependency");
        if (visited[j] == 2) return;
        visited[j] = 1;
        if (inputs[j].mimicIndex >= 0) {
            visit(inputs[j].mimicIndex);
            mimicOrder.push_back(j);
        }
        visited[j] = 2;
    };
    for (size_t j = 0; j < info.size(); ++j) visit(j);

    for (size_t j = 0; j < info.size(); ++j) {
        const auto mesh = info[j]["mesh"];
        if (mesh && !mesh.IsNull() && !mesh.as<std::string>().empty())
            links[j].setMesh((dir / mesh.as<std::string>()).string());
    }
    removeRobotModel();
    _linkGrp = std::move(links);
    _jointInputs = std::move(inputs);
    _mimicOrder = std::move(mimicOrder);
    _freedom = freedom;

    _points = vtkPoints::New();
    _traj = vtkActor::New();

    _traj->GetProperty()->SetColor(73/255.0, 111/255.0, 255/255.0);
    _traj->GetProperty()->SetLineWidth(3);

    if (_renderer) _renderer->AddActor(_traj);

    updateModel(std::vector<double>(_freedom, 0.0));

    std::cout << "Model is loaded." << std::endl;
    if (_renderer) addToRenderer(_renderer);
}

void Model::removeRobotModel()
{
    if (_renderer) {
        for (auto& link : _linkGrp) {
            _renderer->RemoveActor(link.actor);
            _renderer->RemoveActor(link.axesActor);
        }
        if (_traj) _renderer->RemoveActor(_traj);
    }
    _linkGrp.clear();
    _jointInputs.clear();
    _mimicOrder.clear();
    _freedom = 0;
    _traj = nullptr;
    _points = nullptr;
}

void Model::updateModel(const std::vector<double>& jointPositions)
{
    if (_linkGrp.empty() || jointPositions.size() < static_cast<size_t>(_freedom)) return;
    for (int j = 0; j < _freedom; ++j)
        if (!std::isfinite(jointPositions[j])) return;

    for (size_t i = 0; i < _linkGrp.size(); ++i) {
        if (_jointInputs[i].stateIndex >= 0)
            _linkGrp[i].setAngle(jointPositions[_jointInputs[i].stateIndex]);
    }
    for (const auto i : _mimicOrder) {
        const auto& input = _jointInputs[i];
        _linkGrp[i].setAngle(_linkGrp[input.mimicIndex].getAngle() * input.multiplier + input.offset);
    }

    Eigen::Transform<double, 3, Eigen::Affine> t_j(Eigen::Scaling(1.0)); // joint transform
    Eigen::Transform<double, 3, Eigen::Affine> t_l(Eigen::Scaling(1.0)); // link transform

    for(int i = 0; i < _linkGrp.size(); i++) {

        t_j *= Eigen::Translation3d(_linkGrp[i].getTranslate());

        t_j *= Eigen::AngleAxisd(_linkGrp[i].getRotate()[2], Eigen::Vector3d::UnitZ());
        t_j *= Eigen::AngleAxisd(_linkGrp[i].getRotate()[1], Eigen::Vector3d::UnitY());
        t_j *= Eigen::AngleAxisd(_linkGrp[i].getRotate()[0], Eigen::Vector3d::UnitX());
        if (_linkGrp[i].getType() == Link::PRISMATIC)
            t_j *= Eigen::Translation3d(_linkGrp[i].getAngleAxis() * _linkGrp[i].getAngle());
        else if (_linkGrp[i].getType() == Link::REVOLUTE || _linkGrp[i].getType() == Link::CONTINUOUS)
            t_j *= Eigen::AngleAxisd(_linkGrp[i].getAngle(), _linkGrp[i].getAngleAxis());


        auto mat = t_j.matrix();
        vtkNew<vtkMatrix4x4> vm;
        for(size_t i = 0; i < 4; i++) {
            for(size_t j = 0; j < 4; j++) {
                vm->SetElement(i,j, mat(i, j));
            }
        }

        vtkNew<vtkTransform> vt1; //Axes Tranform
        vt1->SetMatrix(vm);

        _linkGrp[i].setAxesActorTransform(vt1);  // Axes on Joint

        t_l = t_j * Eigen::Translation3d(_linkGrp[i].getTranslateLink());

        t_l *= Eigen::AngleAxisd(_linkGrp[i].getRotateLink()[2], Eigen::Vector3d::UnitZ());
        t_l *= Eigen::AngleAxisd(_linkGrp[i].getRotateLink()[1], Eigen::Vector3d::UnitY());
        t_l *= Eigen::AngleAxisd(_linkGrp[i].getRotateLink()[0], Eigen::Vector3d::UnitX());

        mat = t_l.matrix();

        for(size_t i = 0; i < 4; i++) {
            for(size_t j = 0; j < 4; j++) {
                vm->SetElement(i,j, mat(i, j));
            }
        }

        vtkNew<vtkTransform> vt2; //Link Transform
        vt2->SetMatrix(vm);
        _linkGrp[i].setLinkActorTransform(vt2); //vt2 will change with actor
    }

    //trajectory

    if(_isTrajVisible) {
        auto transform = _linkGrp[_linkGrp.size() - 1].axesActor->GetUserTransform();
        // 获取变换矩阵
        vtkSmartPointer<vtkMatrix4x4> matrix = transform->GetMatrix();

        // 获取平移部分
        double p[3] = {0, 0, 0};
        if(_points->GetNumberOfPoints() > 0)
            _points->GetPoint(_points->GetNumberOfPoints() - 1, p);
        if(_points->GetNumberOfPoints() > 0 && fabs(matrix->GetElement(0, 3) - p[0]) < 1e-6 && fabs(matrix->GetElement(1, 3) - p[1]) < 1e-6 && fabs(matrix->GetElement(2, 3) - p[2]) < 1e-6) {

        } else {
            _points->InsertNextPoint( matrix->GetElement(0, 3), matrix->GetElement(1, 3),  matrix->GetElement(2, 3));
        }

        if(_points->GetNumberOfPoints() > 500) {
            deleteFirstPoint();
        }
        vtkNew<vtkPolyLine> _line;
        _line->GetPointIds()->SetNumberOfIds(_points->GetNumberOfPoints());
        for (vtkIdType i = 0; i < _points->GetNumberOfPoints(); i++) {
            _line->GetPointIds()->SetId(i, i);
        }

        vtkNew<vtkCellArray> _lines;
        _lines->InsertNextCell(_line);

        vtkNew<vtkPolyData> polyData;
        polyData->SetPoints(_points);
        polyData->SetLines(_lines);

        vtkNew<vtkPolyDataMapper> mapper;
        mapper->SetInputData(polyData);

        _traj->SetMapper(mapper);
    }
    else {
        if(_points)
            _points->SetNumberOfPoints(0);
    }

}

void Model::addToRenderer(vtkRenderer *renderer)
{
    for(size_t i = 0; i < _linkGrp.size(); i++) {
        renderer->AddActor(_linkGrp[i].actor);
        renderer->AddActor(_linkGrp[i].axesActor);
    }

//    renderer->AddActor(_traj);
}

void Model::setAxesVisiblity(bool isVisible)
{
    for(size_t i = 0; i < _linkGrp.size(); i++) {
        _linkGrp[i].setAxesVisibility(isVisible);
    }
}

void Model::setMeshVisibility(bool isMesh)
{
    for(size_t i = 0; i < _linkGrp.size(); i++) {
        _linkGrp[i].setMeshVisibility(isMesh);
    }
}

void Model::setTrajVisiblity(bool isVisible)
{
    _isTrajVisible = isVisible;
}

void Model::deleteFirstPoint()
{
    vtkSmartPointer<vtkPoints> newPoints = vtkSmartPointer<vtkPoints>::New();
    for(vtkIdType i = 1; i < _points->GetNumberOfPoints(); i++)
    {
        double p[3];
        _points->GetPoint(i,p);
        newPoints->InsertNextPoint(p);
    }

    _points->ShallowCopy(newPoints);
}

void Model::setRenderer(vtkRenderer *renderer) {
    _renderer = renderer;
}




