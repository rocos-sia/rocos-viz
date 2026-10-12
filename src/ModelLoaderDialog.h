#ifndef MODELLOADERDIALOG_H
#define MODELLOADERDIALOG_H

#include <QDialog>
#include <QDebug>

namespace Ui {
class ModelLoaderDialog;
}

class ModelLoaderDialog : public QDialog
{
    Q_OBJECT

public:
    explicit ModelLoaderDialog(QWidget *parent = nullptr);
    ~ModelLoaderDialog();

    QString getCfgFileName();

private slots:
    void on_openFileButton_clicked();

    void on_uploadButton_clicked();

    void on_removeButton_clicked();

    void on_exitButton_clicked();

private:
    Ui::ModelLoaderDialog *ui;
    QString cfgFileName;

signals:
    void getRobotModel();
    void removeRobotModel();
};

#endif // MODELLOADERDIALOG_H
