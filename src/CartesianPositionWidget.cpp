#include "CartesianPositionWidget.h"
#include "ui_CartesianPositionWidget.h"

#include "JogButtonController.h"

CartesianPositionWidget::CartesianPositionWidget(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::CartesianPositionWidget)
{
    ui->setupUi(this);

    jogController_ = new JogButtonController(this, ui->cartesianPlusButton,
        ui->cartesianMinusButton, [this](int direction) { emit cartesianJogging(id, direction); });

    this->ui->cartesianValBar->setAlignment(Qt::AlignLeft | Qt::AlignVCenter);

    updateVal(cartesianVal);

}

CartesianPositionWidget::~CartesianPositionWidget()
{
    jogController_->stop();
    delete ui;
}

void CartesianPositionWidget::updateDisp()
{
    this->ui->cartesianValBar->setFormat(tr("%1").arg(cartesianVal * r2d, 0 ,'f', 3));
}

void CartesianPositionWidget::setName(const QString &s)
{
    name = s;
    ui->name->setText(name);
    updateDisp();
}

void CartesianPositionWidget::setFactor(double f)
{
    factor = f;
}

void CartesianPositionWidget::updateVal(double val)
{
    cartesianVal = val;
    this->ui->cartesianValBar->setValue(cartesianVal * r2d);
    updateDisp();
}

void CartesianPositionWidget::on_cartesianPlusButton_pressed()
{
    jogController_->start(ui->cartesianPlusButton, 1);
}

void CartesianPositionWidget::on_cartesianPlusButton_released()
{
    jogController_->stop();
}

void CartesianPositionWidget::on_cartesianMinusButton_pressed()
{
    jogController_->start(ui->cartesianMinusButton, -1);
}

void CartesianPositionWidget::on_cartesianMinusButton_released()
{
    jogController_->stop();
}
