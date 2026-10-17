#include "ConnectDialog.h"
#include "ui_ConnectDialog.h"

#include <QDebug>

#include <Protocol.h> //通讯协议
#include <fstream>
#include <filesystem>
#include <iomanip>

const int POLLING_INTERVAL_MS = 20; // 轮询间隔 100ms

ConnectDialog::ConnectDialog(QWidget *parent) :
        QDialog(parent),
        ui(new Ui::ConnectDialog) {
    ui->setupUi(this);

    setAttribute(Qt::WA_TranslucentBackground);
    setWindowFlag(Qt::FramelessWindowHint);

    ui->ipAddressEdit->setText(ip_address_); //更新界面默认值
    ui->portEdit->setText(QString::number(port_)); //更新界面默认值

    timer_state_ = new QTimer(this);
    connect(timer_state_, &QTimer::timeout, this, &ConnectDialog::getRobotState); //获取机器人状态

}

ConnectDialog::~ConnectDialog() {
    delete ui;
}

void ConnectDialog::on_connectButton_clicked() {
    bool isAutoLoad = ui->autoLoadCheck->isChecked();
    connectedToRobot(true, isAutoLoad);
}

void ConnectDialog::on_ipAddressEdit_textChanged(const QString &ip) {
    ip_address_ = ip;
}

void ConnectDialog::on_portEdit_textChanged(const QString &p) {
    port_ = p.toInt();
}

void ConnectDialog::connectedToRobot(bool con, bool autoLoadModel) {
    if (con) { //连接机器人
        if (is_connected_)
            return;

        grpc::ChannelArguments channel_args;
        channel_args.SetMaxReceiveMessageSize(-1); // 设置接收消息的最大长度，-1表示不限制
        channel_ = grpc::CreateCustomChannel(QString("%1:%2").arg(ip_address_).arg(port_).toStdString(),
                                       grpc::InsecureChannelCredentials(), channel_args);

        stub_ = RobotService::NewStub(channel_);

        //获取一下RobotInfo,顺便测试一下连接否成功
        RobotInfoRequest request;
//      RobotInfoResponse response;
        Status status;

        //之前发现如果退出程序，重启只发送一次会卡住，所以多发几次，但这个问题需要仔细研究一下
        // 后来发现不是这个原因造成的,是由于channel_没有释放造成的
        ClientContext context; //这个只能使用一次，每次请求都需要重新创建
        status = stub_->ReadRobotInfo(&context, request, &robot_info_response_);

        if (status.ok()) {
            emit connectState(true);
            timer_state_->start(POLLING_INTERVAL_MS); // 如果连接上机器人，则以POLLING_INTERVAL_MS间隔轮询数据
            this->close();
            is_connected_ = true;

            cnt_per_unit_.resize(robot_info_response_.robot_info().joint_infos_size());
            torque_per_unit_.resize(robot_info_response_.robot_info().joint_infos_size());
            load_per_unit_.resize(robot_info_response_.robot_info().joint_infos_size());
            ratio_.resize(robot_info_response_.robot_info().joint_infos_size());
            pos_zero_offset_.resize(robot_info_response_.robot_info().joint_infos_size());

            user_unit_name_.resize(robot_info_response_.robot_info().joint_infos_size());
            torque_unit_name_.resize(robot_info_response_.robot_info().joint_infos_size());
            load_unit_name_.resize(robot_info_response_.robot_info().joint_infos_size());

            jnt_num_ = robot_info_response_.robot_info().joint_infos_size();

            for (int i = 0; i < robot_info_response_.robot_info().joint_infos_size(); ++i) {
                cnt_per_unit_[i] = robot_info_response_.robot_info().joint_infos().at(i).cnt_per_unit();
                torque_per_unit_[i] = robot_info_response_.robot_info().joint_infos().at(i).torque_per_unit();
                //TODO: load_per_unit
                user_unit_name_[i] = QString::fromStdString(
                        robot_info_response_.robot_info().joint_infos().at(i).user_unit_name());
                //TODO: torque_unit_name 及 load_unit_name

                qDebug() << "Joint " << i << ": ";
                qDebug() << "    cnt_per_unit: "
                         << robot_info_response_.robot_info().joint_infos().at(i).cnt_per_unit();
                qDebug() << "    torque_per_unit: "
                         << robot_info_response_.robot_info().joint_infos().at(i).torque_per_unit();
                qDebug() << "    ratio: " << robot_info_response_.robot_info().joint_infos().at(i).ratio();
                qDebug() << "    pos_zero_offset: "
                         << robot_info_response_.robot_info().joint_infos().at(i).pos_zero_offset();
                qDebug() << "    user_unit_name: "
                         << robot_info_response_.robot_info().joint_infos().at(i).user_unit_name().c_str();

            }

            if(autoLoadModel)
                getRobotModel(); //if autoLoadCheck is checked, then auto load model from rocos-app

        } else {
            emit connectState(false);
            is_connected_ = false;
        }
    } else { //断开连接机器人
        timer_state_->stop();
        while (channel_.use_count())
            channel_.reset();

        is_connected_ = false;
        emit connectState(false);
    }
}

/// \brief 机械臂多关节使能
/// \param enabled
void ConnectDialog::setRobotEnabled(bool enabled) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    if (enabled)
        request.mutable_command()->mutable_enabled();
    else
        request.mutable_command()->mutable_disabled();

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

void ConnectDialog::setJointSpeedScaling(double factor) {
    std::cout << "Change joint speed scale to " << factor << std::endl;
    factor_ = factor;
}

void ConnectDialog::getJointSpeedScaling() {

}

void ConnectDialog::setCartesianSpeedScaling(double factor) {
}

void ConnectDialog::getCartesianSpeedScaling() {

}

void ConnectDialog::setToolSpeedScaling(double factor) {
}

void ConnectDialog::getToolSpeedScaling() {

}

void ConnectDialog::startScript(QString script) {

}

void ConnectDialog::stopScript() {

}

void ConnectDialog::pauseScript() {

}

void ConnectDialog::continueScript() {

}

void ConnectDialog::getRobotState() {
    RobotStateRequest request;

    if (use_raw_data_) {
        request.set_raw_data(true);
    }

//    RobotStateResponse robot_state_response_;
    robot_state_response_.Clear();

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->ReadRobotState(&context, request, &robot_state_response_);
    if (status.ok()) {
        emit newStateComming(); // 收到了新的机器人状态信息就直接上传

//        std::cout << "JntPos: ";
//        for(int i =0; i < jnt_num_; ++i) {
//            std::cout << getJointPosition(i) << " ; ";
//        }
//        std::cout << std::endl;
//        std::cout << "Joint state size: " << robot_state_response_.robot_state().joint_states_size() << std::endl;
//        std::cout << "Joint state status: " << robot_state_response_.robot_state().joint_states(0).status() << std::endl;
//        std::cout << "slave num: " << robot_state_response_.robot_state().hw_state().slave_num() << std::endl;
//        std::cout << "hw type: " << robot_state_response_.robot_state().hw_state().hw_type() << std::endl;
//        std::cout << "curr cycle time: " << robot_state_response_.robot_state().hw_state().current_cycle_time() << std::endl;
    } else {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
    }
}

void ConnectDialog::jointJogging(int id, int dir) {
//    std::cout << "Joint " << id << " is jogging..." << std::endl;

    RobotCommandRequest request;
    RobotCommandResponse response;

    auto dragging_command = request.mutable_command()->mutable_dragging_command();
    dragging_command->set_flag(static_cast<rocos::DraggingFlag>(id));
    dragging_command->set_dir(static_cast<rocos::DraggingDirection>(dir));
    dragging_command->set_max_speed(max_jnt_speed_ * factor_); // TODO: 需要获取关节最大速度
    dragging_command->set_max_acceleration(max_jnt_speed_ * factor_ * 5); // TODO: 需要获取关节最大加速度

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

void ConnectDialog::cartesianJogging(int frame, int freedom, int dir) {
    std::cout << "Cartesian is jogging..." << std::endl;

    RobotCommandRequest request;
    RobotCommandResponse response;

    auto dragging_command = request.mutable_command()->mutable_dragging_command();
    dragging_command->set_flag(static_cast<rocos::DraggingFlag>(frame));
    dragging_command->set_dir(static_cast<rocos::DraggingDirection>(dir));
    dragging_command->set_max_speed(max_cart_speed_ * factor_); // TODO: 需要获取关节最大速度
    dragging_command->set_max_acceleration(max_cart_speed_ * factor_ * 5); // TODO: 需要获取关节最大加速度

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

void ConnectDialog::setRobotWorkMode(int mode)
{

    RobotCommandRequest request;
    RobotCommandResponse response;

    auto set_work_mode = request.mutable_command()->mutable_general_command()->mutable_set_work_mode();
    set_work_mode->set_value(static_cast<rocos::WorkMode>(mode));

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
        //        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

bool ConnectDialog::event(QEvent *event) {
    if (event->type() == QEvent::ActivationChange) {
        if (QApplication::activeWindow() != this) {
            this->close();
        }
    }

    return QDialog::event(event);
}

void ConnectDialog::powerOn() {
    if(!is_connected_)
        return;

    RobotCommandRequest request;
    RobotCommandResponse response;

    request.mutable_command()->mutable_enabled();

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

void ConnectDialog::powerOff() {
    if(!is_connected_)
        return;

    RobotCommandRequest request;
    RobotCommandResponse response;

    request.mutable_command()->mutable_disabled();

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::shutdown() {
    timer_state_->stop();
    while (channel_.use_count())
        channel_.reset();

    is_connected_ = false;
    emit connectState(false);
}

void ConnectDialog::getRobotModel()
{
    if(!is_connected_)
        return;

    google::protobuf::Empty request;
    RobotModel response;

    ClientContext context;
    Status status = stub_->GetRobotModel(&context, request, &response);

    if(status.ok()) {
        std::cout << "Robot name: " << response.name() << std::endl;

        std::filesystem::path cfgFilePath = "models/" + response.name() + "/config.yaml";
        if(!std::filesystem::exists(cfgFilePath.parent_path())) {
            std::filesystem::create_directories(cfgFilePath.parent_path());
        }

        std::ofstream cfgYamlFile(cfgFilePath);

        if(!cfgYamlFile.is_open()) {
            std::cerr << "Can not open " << cfgFilePath << std::endl;
            return;
        }

        cfgYamlFile.clear(); // clear file content
        cfgYamlFile << std::setprecision(17);
        cfgYamlFile << "robot: " << std::endl;

        // 创建映射表
        std::map<int, std::string> enumMap;
        enumMap[rocos::JointType::UNKNOWN] = "unknown";
        enumMap[rocos::JointType::FIXED] = "fixed";
        enumMap[rocos::JointType::REVOLUTE] = "revolute";
        enumMap[rocos::JointType::PRISMATIC] = "prismatic";
        enumMap[rocos::JointType::CONTINUOUS] = "continuous";
        enumMap[rocos::JointType::FLOATING] = "floating";
        enumMap[rocos::JointType::PLANAR] = "planar";

        for(int i = 0; i < response.links_size(); i++) {
            cfgYamlFile << "  - name: " << response.links(i).name() << std::endl;
            cfgYamlFile << "    order: " << response.links(i).order() << std::endl;

            cfgYamlFile << "    type: " << enumMap[response.links(i).type()] << std::endl;
            const auto& link = response.links(i);
            if (link.has_active())
                cfgYamlFile << "    active: " << (link.active() ? "true" : "false") << std::endl;
            if (link.has_position())
                cfgYamlFile << "    position: " << link.position() << std::endl;
            if (link.has_mimic()) {
                cfgYamlFile << "    mimic:" << std::endl;
                cfgYamlFile << "      joint: " << std::quoted(link.mimic().joint()) << std::endl;
                cfgYamlFile << "      multiplier: " << (link.mimic().has_multiplier() ? link.mimic().multiplier() : 1.0) << std::endl;
                cfgYamlFile << "      offset: " << link.mimic().offset() << std::endl;
            }

            cfgYamlFile << "    translate: [" << response.links(i).translate().x() << ", "
                      << response.links(i).translate().y() << ", "
                        << response.links(i).translate().z() << "]" << std::endl;

            cfgYamlFile << "    rotate: [" <<  response.links(i).rotate().x()  << ", "
                      << response.links(i).rotate().y() << ", "
                        << response.links(i).rotate().z() << "]" << std::endl;

            cfgYamlFile << "    angleAxis: [" << response.links(i).axis().x() << ", "
                      << response.links(i).axis().y() << ", "
                      << response.links(i).axis().z() << "]" << std::endl;


            cfgYamlFile << "    translateLink: [" << response.links(i).translatelink().x()  << ", " << response.links(i).translatelink().y() << ", "
                        << response.links(i).translatelink().z() << "]" << std::endl;

            cfgYamlFile << "    rotateLink: [" << response.links(i).rotatelink().x() << ", " << response.links(i).rotatelink().y() << ", " << response.links(i).rotatelink().z() << "]" << std::endl;

            cfgYamlFile << "    mesh: " << response.links(i).mesh() << std::endl;

            ClientContext context; // get mesh file
            LinkMeshPath pathRequest;
            *pathRequest.mutable_path() = response.links(i).mesh();
            LinkMeshFile meshRespone;
            status = stub_->GetLinkMesh(&context, pathRequest, &meshRespone);
            if(status.ok()) {
                std::ofstream mesh(cfgFilePath.parent_path() / meshRespone.name(), std::ios::binary);
                mesh.write(meshRespone.content().c_str(), meshRespone.content().size());
                mesh.close();

            } else {
                std::cerr << "Can not get mesh file" << std::endl;
            }
        }

        cfgYamlFile.close();

        emit showRobot(QString::fromStdString(cfgFilePath.string())); // send showRobot signal



    } else {
        std::cout << "Fail to get robot model!" << std::endl;
    }
}

void ConnectDialog::powerOn(int id) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    request.mutable_command()->mutable_single_axis_command()->mutable_enabled()->set_id(id);

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::powerOff(int id) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    request.mutable_command()->mutable_single_axis_command()->mutable_disabled()->set_id(id);

    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cerr << "Send command Error" << std::endl;
    }
}

QString ConnectDialog::getHardwareType() {
    switch (robot_state_response_.robot_state().hw_state().hw_type()) {
        case rocos::HardwareState::HardwareType::HardwareState_HardwareType_HW_TYPE_UNKNOWN:
            return tr("Unknown");
        case rocos::HardwareState::HardwareType::HardwareState_HardwareType_HW_TYPE_SIM:
            return tr("Simulation");
        case rocos::HardwareState::HardwareType::HardwareState_HardwareType_HW_TYPE_ETHERCAT:
            return tr("EtherCAT");
        default:
            return "";
    }
}

QString ConnectDialog::getJointStatus(int id) {
    switch (robot_state_response_.robot_state().joint_states(id).status()) {
        case rocos::JointState_Status::JointState_Status_STATUS_FAULT:
            return tr("Fault");
        case rocos::JointState_Status::JointState_Status_STATUS_DISABLED:
            return tr("Disabled");
        case rocos::JointState_Status::JointState_Status_STATUS_ENABLED:
            return tr("Enabled");
        default:
            return "";
    }
}

void ConnectDialog::moveJ(QVector<double> q) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    auto movej = request.mutable_command()->mutable_motion_command()->mutable_move_j();
    for(int i = 0; i < jnt_num_; ++i) {
        qDebug() << "q[" << i << "]: " << q[i];
        movej->mutable_q()->add_data(q[i]);
    }
//    movej->set_speed(vj_);
//    movej->set_acceleration(aj_);
    movej->set_speed(max_jnt_speed_ * factor_);
    movej->set_acceleration(max_jnt_speed_ * factor_ * 1);
    movej->set_time(0);
    movej->set_radius(0);
    movej->set_asynchronous(true);


    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::moveL(QVector<double> pose) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    auto movel = request.mutable_command()->mutable_motion_command()->mutable_move_l();
    movel->mutable_pose()->mutable_position()->set_x(pose[0]);
    movel->mutable_pose()->mutable_position()->set_y(pose[1]);
    movel->mutable_pose()->mutable_position()->set_z(pose[2]);

    auto rotation = Rotation::RPY(pose[3], pose[4], pose[5]);
    double x,y,z,w;
    rotation.GetQuaternion(x,y,z,w);
    movel->mutable_pose()->mutable_rotation()->set_x(x);
    movel->mutable_pose()->mutable_rotation()->set_y(y);
    movel->mutable_pose()->mutable_rotation()->set_z(z);
    movel->mutable_pose()->mutable_rotation()->set_w(w);

//    movel->set_speed(vc_);
//    movel->set_acceleration(ac_);
    movel->set_speed(max_cart_speed_ * factor_);
    movel->set_acceleration(max_cart_speed_ * factor_ * 1);
    movel->set_time(0);
    movel->set_radius(0);
    movel->set_asynchronous(true);


    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::moveJ_IK(QVector<double> pose) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    auto movej_ik = request.mutable_command()->mutable_motion_command()->mutable_move_j_ik();
    movej_ik->mutable_pose()->mutable_position()->set_x(pose[0]);
    movej_ik->mutable_pose()->mutable_position()->set_y(pose[1]);
    movej_ik->mutable_pose()->mutable_position()->set_z(pose[2]);

    auto rotation = Rotation::RPY(pose[3], pose[4], pose[5]);
    double x,y,z,w;
    rotation.GetQuaternion(x,y,z,w);
    movej_ik->mutable_pose()->mutable_rotation()->set_x(x);
    movej_ik->mutable_pose()->mutable_rotation()->set_y(y);
    movej_ik->mutable_pose()->mutable_rotation()->set_z(z);
    movej_ik->mutable_pose()->mutable_rotation()->set_w(w);

//    movej_ik->set_speed(vj_);
//    movej_ik->set_acceleration(aj_);
    movej_ik->set_speed(max_jnt_speed_ * factor_);
    movej_ik->set_acceleration(max_jnt_speed_ * factor_ * 1);
    movej_ik->set_time(0);
    movej_ik->set_radius(0);
    movej_ik->set_asynchronous(true);


    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::moveL_FK(QVector<double> q) {
    RobotCommandRequest request;
    RobotCommandResponse response;

    auto movel_fk = request.mutable_command()->mutable_motion_command()->mutable_move_l_fk();
    for(int i = 0; i < jnt_num_; ++i) {
        movel_fk->mutable_q()->add_data(q[i]);
    }
//    movel_fk->set_speed(vc_);
//    movel_fk->set_acceleration(ac_);
    movel_fk->set_speed(max_cart_speed_ * factor_);
    movel_fk->set_acceleration(max_cart_speed_ * factor_ * 1);
    movel_fk->set_time(0);
    movel_fk->set_radius(0);
    movel_fk->set_asynchronous(true);


    ClientContext context; //这个只能使用一次，每次请求都需要重新创建
    Status status = stub_->WriteRobotCommmand(&context, request, &response);

    if (status.ok()) {
//        std::cout << "Send command Ok" << std::endl;
    } else {
        std::cout << "Send command Error" << std::endl;
    }
}

void ConnectDialog::on_exitButton_clicked()
{
    this->close();
}

