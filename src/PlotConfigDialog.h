#ifndef PLOTCONFIGDIALOG_H
#define PLOTCONFIGDIALOG_H

#include <QDialog>
#include <QTreeWidget>
#include <QDebug>

namespace Ui {
class PlotConfigDialog;
}

class PlotConfigDialog : public QDialog
{
    Q_OBJECT

public:
    explicit PlotConfigDialog(QWidget *parent = nullptr);
    ~PlotConfigDialog();

    QTreeWidget* tree;

private slots:
    void on_exitButton_clicked();

    void on_addBtn_clicked();

    void on_removeBtn_clicked();

    void on_dirButton_clicked();

    void on_applyBtn_clicked();

    void on_cancelBtn_clicked();

private:
    Ui::PlotConfigDialog *ui;

    QString timestamp; //用于记录保存文件时间的时间戳
    QString saveDir = "./";  //保存记录文件的路径
};

#endif // PLOTCONFIGDIALOG_H
