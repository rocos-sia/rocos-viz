#ifndef JOINTPOSITIONWIDGET_H
#define JOINTPOSITIONWIDGET_H

#include <QWidget>
#include <Protocol.h> //协议
#include <QDebug>


namespace Ui {
class JointPositionWidget;
}
class JogButtonController;

class JointPositionWidget : public QWidget
{
    Q_OBJECT

public:
    explicit JointPositionWidget(QWidget *parent = nullptr);
    ~JointPositionWidget();

    void setName(const QString& s);

    void setFactor(double f);

    inline void setId(int jntId) { id = jntId; }

    void setAngleRep(int flag);

public slots:
    void updateJointPosition(double val);

    void on_jointPosValBar_valueChanged(double value);

    void on_jointPosPlusButton_pressed();

    void on_jointPosPlusButton_released();

    void on_jointPosMinusButton_pressed();

    void on_jointPosMinusButton_released();

signals:
    void jointPositionJogging(int id, int dir); //关节点动, >0为正 <0为负 0为停止

private:
    Ui::JointPositionWidget *ui;

    double jointPos = 0; //用浮点型保存关节位置值
    double step     = 0.1; //每次步进的量

    double factor = 0.5; //speed缩放因子

    double r2d    = 180.0/M_PI; //radius to degree

    int     id = 0;
    QString name;

    JogButtonController *jogController_;



};

#endif // JOINTPOSITIONWIDGET_H
