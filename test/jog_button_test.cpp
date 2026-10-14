#include "JointPositionWidget.h"
#include "CartesianPositionWidget.h"
#include <QApplication>
#include <QKeyEvent>
#include <QPushButton>
#include <QSignalSpy>
#include <QTest>
#include <iostream>
#include <stdexcept>

static void check(bool value, const char *message)
{
    if (!value) throw std::runtime_error(message);
}

template<class Widget, class Signal>
void exercise(const QString& prefix, Signal signal)
{
    Widget widget;
    widget.setId(3);
    widget.show();
    QTest::qWait(30);
    auto *plus = widget.template findChild<QPushButton *>(prefix + "PlusButton");
    auto *minus = widget.template findChild<QPushButton *>(prefix + "MinusButton");
    check(plus && minus, "Missing jog buttons");
    check(!plus->autoRepeat() && !minus->autoRepeat(), "Button auto-repeat must be disabled");
    QSignalSpy spy(&widget, signal);
    auto held = [&](int direction) {
        check(spy.count() >= 4 && spy.count() <= 8, "Expected a 50 ms jog heartbeat");
        for (const auto& event : spy) {
            check(event[0].toInt() == 3, "Wrong joint/Cartesian axis");
            check(event[1].toInt() == direction, "Held button emitted stop or wrong direction");
        }
    };
    auto stopped = [&]() {
        check(!spy.empty() && spy.last()[1].toInt() == 0, "Missing stop");
        int stops = 0;
        for (const auto& event : spy) if (event[1].toInt() == 0) ++stops;
        check(stops == 1, "Stop must be emitted exactly once");
        const int count = spy.count();
        QTest::qWait(130);
        check(spy.count() == count, "Jog continued after cancellation/release");
    };

    // Physical hold must never synthesize the old stop/start pairs.
    QTest::mousePress(plus, Qt::LeftButton);
    check(spy.count() == 1, "First command must be immediate");
    QTest::qWait(240); held(1);
    QTest::mouseRelease(plus, Qt::LeftButton); stopped();

    spy.clear();
    QTest::mousePress(minus, Qt::LeftButton);
    QTest::qWait(240); held(-1);
    QTest::mouseRelease(minus, Qt::LeftButton); stopped();

}

// The restart check uses each widget's real pressed slot via the meta-object.
template<class Widget, class Signal>
void cancellation(const QString& prefix, Signal signal)
{
    Widget widget;
    widget.setId(3); widget.show(); QTest::qWait(30);
    auto *button = widget.template findChild<QPushButton *>(prefix + "PlusButton");
    QSignalSpy spy(&widget, signal);
    const QByteArray pressed = "on_" + prefix.toLatin1() + "PlusButton_pressed";
    auto assertStopped = [&]() {
        check(spy.count() == 2 && spy.last()[1].toInt() == 0, "Cancellation must stop exactly once");
        QTest::qWait(120); check(spy.count() == 2, "Cancelled heartbeat continued");
        QTest::mouseRelease(button, Qt::LeftButton);
        check(spy.count() == 2, "Release duplicated cancellation stop");
    };
    QTest::mousePress(button, Qt::LeftButton);
    QEvent leave(QEvent::Leave); QApplication::sendEvent(button, &leave);
    QEvent enter(QEvent::Enter); QApplication::sendEvent(button, &enter);
    QMetaObject::invokeMethod(&widget, pressed.constData(), Qt::DirectConnection);
    assertStopped();

    // A new physical press can start again after cancellation.
    spy.clear(); QTest::mousePress(button, Qt::LeftButton);
    QTest::qWait(70); check(spy.count() >= 2, "Fresh press did not restart");
    QTest::mouseRelease(button, Qt::LeftButton);

    spy.clear(); QTest::mousePress(button, Qt::LeftButton);
    QEvent deactivate(QEvent::WindowDeactivate); QApplication::sendEvent(&widget, &deactivate);
    assertStopped();

    spy.clear(); QTest::mousePress(button, Qt::LeftButton);
    widget.setEnabled(false); assertStopped(); widget.setEnabled(true);

    spy.clear(); QTest::mousePress(button, Qt::LeftButton);
    widget.hide(); assertStopped(); widget.show(); QTest::qWait(30);

    // Native keyboard auto-repeat must not generate synthetic stop/start pairs.
    spy.clear(); button->setFocus(); QTest::keyPress(button, Qt::Key_Space);
    QKeyEvent repeatedRelease(QEvent::KeyRelease, Qt::Key_Space, Qt::NoModifier, " ", true);
    QKeyEvent repeatedPress(QEvent::KeyPress, Qt::Key_Space, Qt::NoModifier, " ", true);
    QApplication::sendEvent(button, &repeatedRelease); QApplication::sendEvent(button, &repeatedPress);
    QTest::qWait(120);
    for (const auto& event : spy) check(event[1].toInt() == 1, "Keyboard repeat interrupted jog");
    QTest::keyRelease(button, Qt::Key_Space);
    check(spy.last()[1].toInt() == 0, "Keyboard release did not stop");
}

int main(int argc, char **argv)
{
    QApplication app(argc, argv);
    try {
        exercise<JointPositionWidget>("jointPos", &JointPositionWidget::jointPositionJogging);
        exercise<CartesianPositionWidget>("cartesian", &CartesianPositionWidget::cartesianJogging);
        cancellation<JointPositionWidget>("jointPos", &JointPositionWidget::jointPositionJogging);
        cancellation<CartesianPositionWidget>("cartesian", &CartesianPositionWidget::cartesianJogging);
        std::cout << "PASS: both widgets hold/release, heartbeat, leave/re-entry, deactivate, disable, hide and keyboard repeat\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
