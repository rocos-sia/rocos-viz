#ifndef PLOTDIALOG_H
#define PLOTDIALOG_H

#include <QWidget>
#include <QMovie>
#include <QTimer>
#include <QTime>
#include <QElapsedTimer>
#include <QDateTime>
#include <QButtonGroup>
#include <QFile>
#include <QtCharts>
#include <ConnectDialog.h>
#include <QDebug>


#define TYPE_JOINT_SPACE 0 // Joint Space
#define TYPE_CARTESIAN_SPACE 1

namespace Ui {
class PlotWidget;
}

class PlotWidget : public QWidget
{
    Q_OBJECT

public:
    explicit PlotWidget(QWidget *parent = nullptr);
    ~PlotWidget();

    void init_joint_space();
    void init_cartesian_space();

    QChartView* addPlot();
    void removePlot(int index); // remove one plot (chartview)
    void removePlot(QChartView* plot); // remove one plot (chartview)

    void addSeries(QChartView* plot, QXYSeries* series); // add one curve
    void addSeries(int index, QXYSeries* series); // add one curve
    void clearSeries(int index); // clear all curves in one plot (chartview)
    void clearSeries(QChartView* plot); // clear all curves in one plot (chartview)

    inline void setConnectPtr(ConnectDialog* ptr) {connect_ptr_ = ptr;} // 设置connect_的指针


public slots:

    void handleNewState(); // 处理新的数据

    void processTree(QTreeWidget* tree);

private slots:

    void processItem(int chart_num, const QString &name);
    void handleMarkerClicked();

private:
    Ui::PlotWidget *ui;

    QMovie* movie;

    QTimer* timer;

    QButtonGroup* plotDispBtnGrp;

    bool isRecording = false;
    bool isSaveData = false;
    bool isAutoScale = true;


    QElapsedTimer* time;

    QString timestamp; //用于记录保存文件时间的时间戳. by think

    QFile* jntPosFile;
    QFile* cartPoseFile;

    bool is2x2 {true}; // 默认就显示2x2布局. by think

    QList<QChartView* > plots; // chartviews, max 4 (2x2). by think
    QList<QList<std::function<double(void)>>> funcs; // 保存获取相应series数据的所有函数指针. by think

    QFont titleFont {"Alibaba PuHuiTi 3.0", 11, QFont::Bold};
    QFont labelFont {"Alibaba PuHuiTi 3.0", 11};


//    void mousePressEvent(QMouseEvent* event) override;
//    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseDoubleClickEvent(QMouseEvent* event) override;

    void connectMarkers(QChart *chart);
    void disconnectMarkers(QChart *chart);

    ConnectDialog* connect_ptr_; // 保存ConnectDialog的指针. by think

//    QList<QList<QLineSeries* >> chartData; // 保存所有chart的数据. by think


};

#endif // PLOTDIALOG_H
