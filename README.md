<!--
 Copyright (c) 2021 'Yang Luo, luoyang@sia.cn'

 This software is released under the MIT License.
 https://opensource.org/licenses/MIT
-->

<div align="center">
  <img src="./rocos-viz.png" alt="" height="150">
  <h1>ROCOS-Viz</h1>
  <blockquote> The Visualization And Remote Control GUI for ROCOS </blockquote>
</div>


![rocos-viz](./res/rocos-viz.gif)

:warning: Rocos-Viz is under development, not finished~ :thinking:

## Introduction

## Dependencies

- [Qt5](https://www.qt.io/cn) Qt GUI libraries

```bash
sudo apt install qt5-default
```

- [Eigen3](http://eigen.tuxfamily.org/index.php?title=Main_Page) Eigen is a C++ template library for linear algebra.

```bash
sudo apt install libeigen3-dev
```

- [VTK](https://vtk.org/) The Visualization Toolkit (VTK) is an open-source, freely available software system for 3D computer graphics, modeling, image processing, volume rendering, scientific visualization, and 2D plotting.

  > VTK8.2 need to be compiled with QVTKOpenglWidget supported.

## Usage

```bash
git clone https://github.com/thinkexist1989/rocos-viz.git
cd rocos-viz/
mkdir build && cd build
cmake ..
make -j`nproc`
./rocos-viz
```

## gRPC 点动

关节和笛卡尔点动在按下按钮时立即发送指令，长按期间每 50 ms 续发。
松开、移出按钮、窗口失去激活或控件隐藏/禁用时停止续发并发送一次停止。
移回按钮不会自动恢复，需重新按下。按钮不使用 Qt autoRepeat，避免重复产生
released/pressed 信号导致机器人反复减速和启动。

重新编译后需退出旧 viz，再运行 `build/bin/rocos-viz`。

安装 Qt Test 模块后可运行无硬件的控件回归测试：

```bash
cmake -S . -B build
cmake --build build -j2
ctest --test-dir build -R '^jog_button_test$' --output-on-failure
```

## Contributor

:bust_in_silhouette: **Yang Luo (luoyang@sia.cn)**

:framed_picture: Icon Designed by :**Yuhan Ying (1027649507@qq.com)**

