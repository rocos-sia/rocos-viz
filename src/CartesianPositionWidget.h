#ifndef CARTESIANPOSITIONWIDGET_H
#define CARTESIANPOSITIONWIDGET_H

#include <QWidget>
#include <Protocol.h>
#include <QDebug>


namespace Ui {
class CartesianPositionWidget;
}
class JogButtonController;

class CartesianPositionWidget : public QWidget
{
    Q_OBJECT

public:
    explicit CartesianPositionWidget(QWidget *parent = nullptr);
    ~CartesianPositionWidget();

    void updateDisp();

    void setName(const QString& s);

    void setFactor(double f);

    inline void setId(int Id) { id = Id; }

    inline void setAngleRep(int flag) {
        r2d = (flag == ANGLE_DEGREE) ? (180.0/M_PI) : 1.0;
        updateVal(cartesianVal);
        qDebug() << "cartid: " << id << " r2d: " << r2d;
    }

    inline void setPosRep(int flag) {
        r2d = (flag == POS_MM) ? 1000.0 : 1.0;
        updateVal(cartesianVal);
        qDebug() << "cartid: " << id << " mm2m: " << r2d;
    }

public slots:
    void updateVal(double val);

    void on_cartesianPlusButton_pressed();

    void on_cartesianPlusButton_released();

    void on_cartesianMinusButton_pressed();

    void on_cartesianMinusButton_released();

signals:
    void cartesianJogging(int freedom, int dir); //关节点动

private:
    Ui::CartesianPositionWidget *ui;

    QString name;
    double cartesianVal = 0; //用浮点型保存笛卡尔位置值
    double step     = 0.001; //每次步进的量

    uint16_t val = 0; // Progress的值

    int    progressStep = 2000; // 最大步进量
    double factor = 0.5; //speed缩放因子

    double r2d = 1000.0; // 由于笛卡尔位置只有rpy需要转换角度，默认为1000, 单位mm

    JogButtonController *jogController_;

    int     id = 0;

};

#endif // CARTESIANPOSITIONWIDGET_H
