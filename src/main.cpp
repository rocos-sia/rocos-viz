#include "RocosMainWindow.h"

#include <QApplication>

#include <QSurfaceFormat>
#include <QStyleFactory>

#include <QVTKOpenGLNativeWidget.h>

#include <SplashScreen.h>

#include <QThread>

#include <SceneWidget.h>

#include <QCommandLineParser>

int main(int argc, char *argv[])
{
    // needed to ensure appropriate OpenGL context is created for VTK rendering.
    QSurfaceFormat::setDefaultFormat(QVTKOpenGLNativeWidget::defaultFormat());

    QApplication::setStyle(QStyleFactory::create("Fusion"));

    QApplication a(argc, argv);
    a.setWindowIcon(QIcon(":/icon.png"));

//    QCommandLineParser parser;
//    parser.setApplicationDescription("ROCOS-Viz Application");
//    parser.addHelpOption();
//    parser.addVersionOption();

//    QCommandLineOption modelOption(QStringList() << "m" << "model",
//                                   QCoreApplication::translate("main", "Load model from <file>."),
//                                   QCoreApplication::translate("main", "file"),
//                                   "models/talon/config.yaml");
//    parser.addOption(modelOption);
//    parser.process(a);

//    yamlCfgFile = parser.value(modelOption).toStdString();




//    QPixmap pixmap(":/res/splash.png");://res/rocos-viz.jpg
    QPixmap pixmap(":/res/logo.png");
    QPixmap scaledPixmap = pixmap.scaled(700,700, Qt::KeepAspectRatio, Qt::SmoothTransformation);
    SplashScreen* splash = new SplashScreen(scaledPixmap, 10000);
    splash->show();

    for(int i = 0; i <= 100; i++) {
        splash->setProgress(i);
        splash->repaint(); // 在Linux下必须加入这句，否则不显示splash screen
        QThread::usleep(10000);
    }

    RocosMainWindow w;
    w.show();

    splash->finish(&w);
    return a.exec();
}
