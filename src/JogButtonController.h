#ifndef JOGBUTTONCONTROLLER_H
#define JOGBUTTONCONTROLLER_H

#include <QAbstractButton>
#include <QApplication>
#include <QEvent>
#include <QKeyEvent>
#include <QTimer>
#include <QWidget>
#include <functional>
#include <utility>

// Keep the jog heartbeat separate from QAbstractButton's auto-repeat, which
// emits released()/pressed() pairs even while the physical button is held.
class JogButtonController : public QObject
{
public:
    JogButtonController(QWidget *owner, QAbstractButton *plus, QAbstractButton *minus,
                        std::function<void(int)> send)
        : QObject(owner), owner_(owner), send_(std::move(send)), timer_(this)
    {
        for (auto *button : {plus, minus}) {
            button->setAutoRepeat(false);
            button->installEventFilter(this);
        }
        owner->installEventFilter(this);
        if (owner->window() != owner) owner->window()->installEventFilter(this);
        timer_.setTimerType(Qt::PreciseTimer);
        timer_.setInterval(50);
        connect(&timer_, &QTimer::timeout, this, [this]() {
            if (active_ && active_->isDown() && active_->isEnabled()) send_(direction_);
            else stop();
        });
        connect(qApp, &QGuiApplication::applicationStateChanged, this,
                [this](Qt::ApplicationState state) {
            if (state != Qt::ApplicationActive) cancel();
        });
    }

    void start(QAbstractButton *button, int direction)
    {
        if (cancelled_ || !owner_->isEnabled() || !button->isEnabled()) return;
        if (active_ == button) return;
        stop();
        active_ = button;
        direction_ = direction;
        timer_.start();
        send_(direction_);
    }

    void stop()
    {
        timer_.stop();
        if (!active_) return;
        active_ = nullptr;
        direction_ = 0;
        send_(0);
    }

protected:
    bool eventFilter(QObject *object, QEvent *event) override
    {
        if (event->type() == QEvent::KeyPress || event->type() == QEvent::KeyRelease) {
            // OS keyboard auto-repeat must not synthesize extra stop/start pairs.
            if (static_cast<QKeyEvent *>(event)->isAutoRepeat()) return true;
        }
        if (event->type() == QEvent::MouseButtonPress || event->type() == QEvent::KeyPress)
            cancelled_ = false;
        if ((object == active_ && (event->type() == QEvent::Leave ||
                                  event->type() == QEvent::UngrabMouse)) ||
            event->type() == QEvent::WindowDeactivate || event->type() == QEvent::Hide ||
            (event->type() == QEvent::EnabledChange &&
             (!owner_->isEnabled() || (active_ && !active_->isEnabled())))) {
            cancel();
        }
        return QObject::eventFilter(object, event);
    }

private:
    void cancel()
    {
        if (!active_) return;
        cancelled_ = true; // Re-entering while still held must not restart a jog.
        stop();
    }

    QWidget *owner_;
    std::function<void(int)> send_;
    QTimer timer_;
    QAbstractButton *active_ = nullptr;
    int direction_ = 0;
    bool cancelled_ = false;
};

#endif
