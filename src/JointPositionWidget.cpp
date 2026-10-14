#include "JointPositionWidget.h"
#include "ui_JointPositionWidget.h"

#include "JogButtonController.h"

JointPositionWidget::JointPositionWidget(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::JointPositionWidget)
{
    ui->setupUi(this);

    ui->jointPosValBar->setRange(-M_PI*r2d, M_PI*r2d);
    updateJointPosition(jointPos);

    jogController_ = new JogButtonController(this, ui->jointPosPlusButton,
        ui->jointPosMinusButton, [this](int direction) { emit jointPositionJogging(id, direction); });

}

JointPositionWidget::~JointPositionWidget()
{
    jogController_->stop();
    delete ui;
}

void JointPositionWidget::setName(const QString &s)
{
    name = s;
//    this->ui->jointPosValBar->setName(name);
    ui->name->setText(name);
}

void JointPositionWidget::setFactor(double f)
{
    factor = f;
}

void JointPositionWidget::setAngleRep(int flag)
{
    r2d = (flag == ANGLE_DEGREE) ? (180.0/M_PI) : 1.0;
    ui->jointPosValBar->setRange(-M_PI*r2d, M_PI*r2d);
    updateJointPosition(jointPos); //立即更新一下显示
    qDebug() << "jntid: " << id << " r2d: " << r2d;
}

void JointPositionWidget::updateJointPosition(double val)
{
    jointPos = val;
    this->ui->jointPosValBar->setValue(jointPos * r2d);
}

void JointPositionWidget::on_jointPosValBar_valueChanged(double value)
{
//    std::cout << "value change to: " << value << std::endl;
}

void JointPositionWidget::on_jointPosPlusButton_pressed()
{
    jogController_->start(ui->jointPosPlusButton, 1);
}

void JointPositionWidget::on_jointPosPlusButton_released()
{
    jogController_->stop();
}

void JointPositionWidget::on_jointPosMinusButton_pressed()
{
    jogController_->start(ui->jointPosMinusButton, -1);
}


void JointPositionWidget::on_jointPosMinusButton_released()
{
    jogController_->stop();
}
