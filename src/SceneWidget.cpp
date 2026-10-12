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

#include <SceneWidget.h>
#include <vtkPNGReader.h>
#include <vtkImageCast.h>
#include <vtkImageActor.h>

#include <QFile>
#include <QTimer>


#define LANDAU_LOGO "landau.png"
#define FRAME_RATE 20 // 20 frames per second, 50ms

/*
 * @brief 构造函数中，初始化各种默认组件
 */
SceneWidget::SceneWidget(QWidget *parent) :
    QVTKOpenGLNativeWidget(parent),
    colors(vtkNamedColors::New()),
    renderer(vtkRenderer::New()),
    renderWindow(vtkGenericOpenGLRenderWindow::New()),
    groundSource(vtkPlaneSource::New()),
    groundActor(vtkActor::New()),
    axesActor(vtkAxesActor::New()),
    marker(vtkOrientationMarkerWidget::New()),
    style(MouseInteractorChooseActor::New())
{
    /* ======== 画平面 ======== */
    groundSource->SetXResolution(10);
    groundSource->SetYResolution(10);
    groundSource->SetOrigin(-1,-1, 0);
    groundSource->SetPoint1(1, -1, 0);
    groundSource->SetPoint2(-1, 1, 0);

    vtkNew<vtkPolyDataMapper> groundMapper;
    groundMapper->SetInputConnection(groundSource->GetOutputPort());

    groundActor->SetMapper(groundMapper);
    groundActor->GetProperty()->SetRepresentationToWireframe();
    groundActor->GetProperty()->SetColor(colors->GetColor3d("DeepSkyBlue").GetData());

    /* ======== 画坐标系 ======== */
//    axesActor->SetPosition(0,0,0);
//    axesActor->SetTotalLength(2,2,2);
//    axesActor->SetShaftType(0);
//    axesActor->SetAxisLabels(0);
//    axesActor->SetXAxisLabelText("X axis");
//    axesActor->SetYAxisLabelText("Y axis");
//   axesActor->SetScale(0.5);
//    axesActor->SetCylinderRadius(0.01);
//    axesActor->SetConeRadius(0.05);



//    /* ======== 关节0 ========== */
//    vtkNew<vtkSTLReader> reader0;
//    reader0->SetFileName("models/iiwa/link_0.stl");
//    reader0->Update();

//    vtkNew<vtkPolyDataMapper> mapper0;
//    mapper0->SetInputConnection(reader0->GetOutputPort());

//    vtkNew<vtkActor> link0Actor;
//    link0Actor->SetMapper(mapper0);
////    link0Actor->GetProperty()->SetDiffuse();

//    /* ======== 关节1 ========== */
//    vtkNew<vtkSTLReader> reader1;
//    reader1->SetFileName("models/iiwa/link_1.stl");
//    reader1->Update();

//    vtkNew<vtkPolyDataMapper> mapper1;
//    mapper1->SetInputConnection(reader1->GetOutputPort());

//    vtkNew<vtkTransform> trans1;
//    trans1->Translate(0.0, 0.0, 0.15);
//    trans1->RotateZ(0.0);
//    trans1->RotateY(0.0);
//    trans1->RotateX(0.0);

//    trans1->Translate(0.0, 0.0, 0.0075);
//    trans1->RotateZ(0.0);
//    trans1->RotateY(0.0);
//    trans1->RotateX(0.0);

//    vtkNew<vtkActor> link1Actor;
//    link1Actor->SetMapper(mapper1);
//    link1Actor->SetUserTransform(trans1);

//    model = std::make_shared<Model>(yamlCfgFile);
//    model->addToRenderer(renderer);

    model = std::make_shared<Model>();
    model->setRenderer(renderer); // 直接将render指针传递给model


    /* ======== 渲染器 ========== */
   renderer->GradientBackgroundOn(); //开启渐变

   renderer->SetBackground(colors->GetColor3d("White").GetData()); // 下
   renderer->SetBackground2(82.0/255,  121.0/255, 254.0/255); //#5279fe 上
      // renderer->SetBackground(colors->GetColor3d("White").GetData());
    /* ======== 渲染窗口 ========== */
    renderWindow->AddRenderer(renderer);
    /* ======== 关联渲染窗口 ========== */
    this->setRenderWindow(renderWindow);


//    renderer->AddActor(axesActor); // 画坐标系
    renderer->AddActor(groundActor); // 画平面

    bool isExist = QFile::exists(LANDAU_LOGO);

    if(isExist) {
        vtkNew<vtkPNGReader> pngReader;
        pngReader->SetFileName(LANDAU_LOGO);
        pngReader->Update();

        vtkNew<vtkImageCast> castFilter;
        castFilter->SetInputConnection(pngReader->GetOutputPort());
        castFilter->SetOutputScalarTypeToUnsignedChar();
        castFilter->Update();

        vtkNew<vtkImageActor> imageActor;
        imageActor->SetInputData(castFilter->GetOutput());
        imageActor->SetOpacity(0.5);
        imageActor->RotateZ(90.0);
        imageActor->SetScale(0.0005);

        // 将旋转、缩放后的图片中心平移到世界坐标原点。
        double* center = imageActor->GetCenter();
        imageActor->SetPosition(-center[0], -center[1], -center[2]);

        renderer->AddActor(imageActor);  // 画Logo
    }


//    renderer->AddActor(link0Actor); // link0
//    renderer->AddActor(link1Actor); // link1

    marker->SetOrientationMarker(axesActor);
    marker->SetInteractor(this->interactor());
    marker->EnabledOn();
    marker->InteractiveOff();
//    axes->InteractiveOn();
//    axes->SetPickingManaged(false);


//    renderer->ResetCamera();


//    renderer->GetActiveCamera()->Pitch(45);
//    renderer->GetActiveCamera()->Azimuth(30);
//    renderer->GetActiveCamera()->Elevation(-30);
    renderer->GetActiveCamera()->SetPosition(3,3,3);
    renderer->GetActiveCamera()->SetFocalPoint(0,0,0.5);
    renderer->GetActiveCamera()->SetViewUp(0,0,1);

    style->SetDefaultRenderer(renderer);
    this->interactor()->SetInteractorStyle(style);


    updateTimer = new QTimer(this);

    connect(updateTimer, &QTimer::timeout, this, [=](){
        if(updatePos) {
            renderWindow->Render();
            updatePos = false;
        }

//        model->deleteFirstPoint(); // delete trajactory point

    });
    updateTimer->setInterval(1000.0 / FRAME_RATE);

    updateTimer->start();

}

SceneWidget::~SceneWidget()
{

}

void SceneWidget::setJointPos(std::vector<double>& jntRads)
{
    model->updateModel(jntRads);

    updatePos = true;
//    renderWindow->Render();
}

void SceneWidget::setJointPos(QVector<double> &jntRads)
{
    std::vector<double> jr(jntRads.data(), jntRads.data() + jntRads.size());
    setJointPos(jr);
}

void SceneWidget::setJointAxesVisibility(bool isVisible)
{
    model->setAxesVisiblity(isVisible);
    renderWindow->Render();
}

void SceneWidget::setMeshVisibility(bool isMesh)
{
    model->setMeshVisibility(isMesh);
    renderWindow->Render();
}

void SceneWidget::setGroundVisibility(bool isVisible)
{

}

void SceneWidget::setTrajVisibility(bool isVisible)
{
    model->setTrajVisiblity(isVisible);
    renderWindow->Render();
}

void SceneWidget::setZAxisView()
{
    renderer->GetActiveCamera()->SetPosition(0,0,3);
    renderer->GetActiveCamera()->SetFocalPoint(0,0,0);
    renderer->GetActiveCamera()->SetViewUp(0,1,0);

    renderWindow->Render();

}

void SceneWidget::setYAxisView()
{
    renderer->GetActiveCamera()->SetPosition(0,3,0.5);
    renderer->GetActiveCamera()->SetFocalPoint(0,0,0.5);
    renderer->GetActiveCamera()->SetViewUp(0,0,1);

    renderWindow->Render();
}

void SceneWidget::setXAxisView()
{
    renderer->GetActiveCamera()->SetPosition(3,0,0.5);
    renderer->GetActiveCamera()->SetFocalPoint(0,0,0.5);
    renderer->GetActiveCamera()->SetViewUp(0,0,1);

    renderWindow->Render();
}

void SceneWidget::setAxoView()
{
    renderer->GetActiveCamera()->SetPosition(3,3,3);
    renderer->GetActiveCamera()->SetFocalPoint(0,0,0.5);
    renderer->GetActiveCamera()->SetViewUp(0,0,1);

    renderWindow->Render();
}

void SceneWidget::displayModelFromYaml(const std::string& yaml_file) {
    yamlCfgFile = yaml_file;
    model->getModelFromYamlFile(yamlCfgFile);
    renderWindow->Render();

}

void SceneWidget::removeRobotModel()
{
    model->removeRobotModel();
    renderWindow->Render();
}
