#include "PlotWidget.h"
#include "ui_PlotWidget.h"
#include <QDebug>
#include <QtMath>
#include <QLegendMarker>

PlotWidget::PlotWidget(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::PlotWidget)

{
    ui->setupUi(this);

    setAttribute(Qt::WA_TranslucentBackground);
    setWindowFlag(Qt::FramelessWindowHint);

//    ui->gridPlot->setColumnStretch(0, 1);
//    ui->gridPlot->setRowStretch(0, 1);

    time = new QElapsedTimer;

    addPlot(); // Chart #1
    addPlot(); // Chart #2
    addPlot(); // Chart #3
    addPlot(); // Chart #4

    for (int i = 0; i < 4; ++i) {
        funcs.append(QList<std::function<double(void)>>());
    }

    //==========设置初始布局1x1==========

//    plots[0]->setVisible(true);
//    plots[1]->setVisible(false);
//    plots[2]->setVisible(false);
//    plots[3]->setVisible(false);

//    is2x2 = false;
    //===================================

//    QList<QLineSeries* > data;

//    for(int num = 0; num < 7; num++) {
//        QLineSeries *series = new QLineSeries;
//        series->setName("J"+ QString::number(num));
//        series->setUseOpenGL(true);
//        for(int i = 0; i < 100; i++) {
//            series->append(i, QRandomGenerator::global()->generateDouble());
//        }

//        data.push_back(series);
//        addSeries(0, series);
//    }

}

PlotWidget::~PlotWidget()
{
    delete ui;
}

void PlotWidget::handleNewState()
{
    for(int i = 0; i < plots.size(); i++) {
        for(int j = 0; j < plots[i]->chart()->series().size(); j++) {
            auto series = plots[i]->chart()->series()[j];
            ((QLineSeries*)series)->append(time->elapsed(), funcs[i][j]());
            plots[i]->chart()->axisX()->setRange(time->elapsed() - 10000, time->elapsed());
        }
    }
}

void PlotWidget::processTree(QTreeWidget *tree)
{
    for(int i = 0; i < tree->topLevelItemCount(); i++) {
        auto chart = tree->topLevelItem(i);
        int chart_num = chart->text(0).right(1).toInt() - 1;
        clearSeries(chart_num); //清除之前的数据关联

        if(chart->childCount() != 0) {  // 如果没有子节点，说明是一个chart. by think
            qDebug() << "Chart #" << chart_num << " : ";
            funcs[chart_num].clear(); // 清除之前关联的函数指针. by think
            for(int j = 0; j < chart->childCount(); j++) {
                qDebug() << "-- " << chart->child(j)->text(0);

                processItem(chart_num, chart->child(j)->text(0));
            }

        }

    }

    time->restart();
}

void PlotWidget::processItem(int chart_num, const QString &name)
{

    if(name == "Position") {
        qDebug() << "===> Joint Position";
        for(int i = 0; i < connect_ptr_->getJointNum(); i++) {
            auto* series = new QLineSeries; // 为每一个关节数据新增一个series. by think
            series->setName("jnt pos "+ QString::number(i + 1)); // 关节从0开始，显示时候+1. by think
            series->setUseOpenGL(true);
            addSeries(chart_num, series);
            funcs[chart_num].push_back([=](){return connect_ptr_->getJointPosition(i);}); // by think
            plots[chart_num]->chart()->axisY()->setRange(-3.14, 3.14);
        }
    } else if(name == "Velocity") {
        qDebug() << "===> Joint Velocity";
        for(int i = 0; i < connect_ptr_->getJointNum(); i++) {
            auto* series = new QLineSeries; // 为每一个关节数据新增一个series. by think
            series->setName("jnt vel "+ QString::number(i + 1)); // 关节从0开始，显示时候+1. by think
            series->setUseOpenGL(true);
            addSeries(chart_num, series);
            funcs[chart_num].push_back([=](){return connect_ptr_->getJointVelocity(i);}); // by think
            plots[chart_num]->chart()->axisY()->setRange(-3.14, 3.14);
        }

    } else if(name == "Current") {
        qDebug() << "===> Joint Current";
        for(int i = 0; i < connect_ptr_->getJointNum(); i++) {
            auto* series = new QLineSeries; // 为每一个关节数据新增一个series. by think
            series->setName("jnt cur "+ QString::number(i + 1)); // 关节从0开始，显示时候+1. by think
            series->setUseOpenGL(true);
            addSeries(chart_num, series);
            funcs[chart_num].push_back([=](){return connect_ptr_->getJointTorque(i);}); // by think
        }

    } else if(name == "Torque") {
        qDebug() << "===> Joint Torque";
        for(int i = 0; i < connect_ptr_->getJointNum(); i++) {
            auto* series = new QLineSeries; // 为每一个关节数据新增一个series. by think
            series->setName("jnt tor "+ QString::number(i + 1)); // 关节从0开始，显示时候+1. by think
            series->setUseOpenGL(true);
            addSeries(chart_num, series);
            funcs[chart_num].push_back([=](){return connect_ptr_->getJointLoad(i);}); // by think
        }
    } else if(name == "x") {

    } else if (name == "y") {

    } else if(name == "z") {

    } else if(name == "rx") {

    } else if(name == "ry") {

    } else if(name == "rz") {

    } else if(name == "fx") {

    } else if(name == "fy") {

    } else if(name == "fz") {

    } else if(name == "mx") {

    } else if(name == "my") {

    } else if(name == "mz") {

    } else {
        qCritical() << "Item Name Wrong!";
        return;
    }




}

void PlotWidget::handleMarkerClicked()
{
    auto marker = qobject_cast<QLegendMarker*>(sender());
    Q_ASSERT(marker);

    switch (marker->type()) {
    case QXYLegendMarker::LegendMarkerTypeXY: {
        marker->series()->setVisible(!marker->series()->isVisible());
        marker->setVisible(true);
        qreal alpha = 1.0;
        if(!marker->series()->isVisible())
            alpha = 0.5;

        QColor color;
        QBrush brush = marker->labelBrush();
        color = brush.color();
        color.setAlphaF(alpha);
        brush.setColor(color);
        marker->setLabelBrush(brush);

        brush = marker->brush();
        color = brush.color();
        color.setAlphaF(alpha);
        brush.setColor(color);
        marker->setBrush(brush);

        QPen pen = marker->pen();
        color = pen.color();
        color.setAlphaF(alpha);
        pen.setColor(color);
        marker->setPen(pen);

        break;
    }
    default:
        break;
    }
}

void PlotWidget::mouseDoubleClickEvent(QMouseEvent *event)
{
    const auto& pos = event->pos();

    for(auto plot : plots) {
        if(plot->geometry().contains(pos)) {
            is2x2 = !is2x2;

            for(auto plot : plots) {
                plot->setVisible(is2x2);
            }

            plot->setVisible(true);

            return;

        }


    }

}

void PlotWidget::connectMarkers(QChart *chart)
{
    const auto& markers = chart->legend()->markers();
    for(QLegendMarker* marker : markers) {
        QObject::disconnect(marker, &QLegendMarker::clicked, this, &PlotWidget::handleMarkerClicked);
        QObject::connect(marker, &QLegendMarker::clicked, this, &PlotWidget::handleMarkerClicked);
    }

}

void PlotWidget::disconnectMarkers(QChart *chart)
{
    const auto& markers = chart->legend()->markers();
    for (QLegendMarker *marker : markers) {
        QObject::disconnect(marker, &QLegendMarker::clicked,
                            this, &PlotWidget::handleMarkerClicked);
    }
}


QChartView *PlotWidget::addPlot()
{
    if(plots.size() >= 4) {
        qCritical() << "You can add up to 4 view!";
        return nullptr;
    }

    QChart* chart = new QChart;
    chart->setTheme(QChart::ChartThemeBlueIcy);
    chart->setTitleFont(titleFont);
    chart->setTitle("Chart #" + QString::number(plots.size() + 1));

//    QValueAxis *axisX = new QValueAxis;
//    QValueAxis *axisY = new QValueAxis;;
//    axisX->setLabelsFont(labelFont);
//    axisY->setLabelsFont(labelFont);
//    chart->addAxis(axisX, Qt::AlignBottom);
//    chart->addAxis(axisY, Qt::AlignLeft);

//    QLineSeries *series = new QLineSeries;
//    chart->addSeries(series);
//    chart->createDefaultAxes();
//    for(auto axis : chart->axes()) {
//        axis->setLabelsFont(labelFont);
//    }

//    chartData.append(QList<QLineSeries* >() << series); // 相当于是插入一个空的QList<QLineSeries* >， 然后把series插入这个QList<QLineSeries* >. by think

    QChartView* plot = new QChartView;
    plots.append(plot);
    ui->gridPlot->addWidget(plot, (plots.size() - 1) / 2, (plots.size()-1) % 2);
//    ui->gridPlot->setColumnStretch((plots.size()-1) % 2, 1);
//    ui->gridPlot->setColumnStretch((plots.size() - 1) / 2, 1);

    plot->setRenderHint(QPainter::Antialiasing);
    plot->setChart(chart);

    return plot;

}

void PlotWidget::addSeries(QChartView *plot, QXYSeries *series)
{
    plot->chart()->addSeries(series);
    connectMarkers(plot->chart());
    plot->chart()->createDefaultAxes();
    for(auto axis : plot->chart()->axes()) {
        axis->setLabelsFont(labelFont);
    }
}

void PlotWidget::addSeries(int index, QXYSeries *series)
{
    addSeries(plots[index], series);
}

void PlotWidget::removePlot(int index) {
    removePlot(plots[index]);
}

void PlotWidget::removePlot(QChartView *plot) {
    plots.removeOne(plot);
    plot->deleteLater();
}

void PlotWidget::clearSeries(QChartView *plot) {
    plot->chart()->removeAllSeries(); // 清除所有的series. 注意，不能用 series().clear()，没有效果。 by think
}

void PlotWidget::clearSeries(int index) {
    clearSeries(plots[index]);
}
