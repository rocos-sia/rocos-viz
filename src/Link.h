/*
Copyright 2021, Yang Luo"
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

@Author
Yang Luo, PHD
Shenyang Institute of Automation, Chinese Academy of Sciences.
 email: luoyang@sia.cn
*/

#ifndef LINK_H
#define LINK_H

#include <string>
#include <vector>

#include <Eigen/Dense>

#include <vtkVector.h>    // vtk向量
#include <vtkTransform.h> // VTK变换
#include <vtkActor.h>     //
#include <vtkSTLReader.h> // 读取STL文件
#include <vtkPolyDataMapper.h> // 数据映射

#include <vtkAxesActor.h> //用于显示关节坐标系

class Link //: public QObject
{
private:
    /* data */

    std::string _directory; // the _directory of CAD file

    int _order = 0; //the _order of the link

    int _type = 0; // joint type

    std::string _name; // the name of the link

    Eigen::Vector3d translate; //translate relative to previous joint
    Eigen::Vector3d rotate; // rotate relative to previous joint
    Eigen::Vector3d angleAxis; // angle-axis format

    Eigen::Vector3d translateLink; //translate the link
    Eigen::Vector3d rotateLink;

    vtkSmartPointer<vtkSTLReader> reader; // 用于读取STL文件

    double angle = 0.0;        // Joint position: radians for rotation, metres for translation

public:
    enum
    {
        UNKNOWN = 0,
        REVOLUTE = 1,
        CONTINUOUS = 2,
        PRISMATIC = 3,
        FLOATING = 4,
        PLANAR = 5,
        FIXED = 6
    };

    vtkSmartPointer<vtkActor>     actor;    // 用于显示

    vtkSmartPointer<vtkAxesActor> axesActor; //关节坐标系
    double      axesLength = 0.2;
    vtkTypeBool isAxesLableShow = 0;
    vtkTypeBool isAxesVisible = 0;

public:
    Link(/* args */);

    Link(const std::string &fileName);

    ~Link();

    void init(); //初始化

    inline void setName(const std::string& name) {_name = name;}
    inline std::string getName() {return _name;}

    inline void setOrder(int order) {_order = order;}
    inline int getOrder() {return _order;}

    inline void setType(int type) { _type = type;}
    inline int getType() {return _type;}

    inline void setTranslate(double x, double y, double z) {translate << x, y, z; }
    inline Eigen::Vector3d getTranslate() {return translate;}

    inline  void setRotate(double roll, double pitch, double yaw) {rotate << roll, pitch, yaw; }
    inline Eigen::Vector3d getRotate() {return rotate;}

    inline void setAngleAxis(double x, double y, double z) {angleAxis << x, y, z;}
    inline Eigen::Vector3d getAngleAxis() {return angleAxis;}



    inline void setTranslateLink(double x, double y, double z) {translateLink << x, y, z; }
    inline Eigen::Vector3d getTranslateLink() {return translateLink;}

    inline  void setRotateLink(double roll, double pitch, double yaw) {rotateLink << roll, pitch, yaw; }
    inline Eigen::Vector3d getRotateLink() {return rotateLink;}

    /**
     * @details Generate mesh
     * @param fileName
     */
    void setMesh(const std::string& fileName);

    void setAngle(double rad);
    inline double getAngle() { return angle; };

    void setAxesActorTransform(vtkTransform* t);
    void setLinkActorTransform(vtkTransform* t);

    void setAxesVisibility(bool isVisible);

    void setMeshVisibility(bool isMesh);            //是否以Mesh形式显示

    void setAxesLabelVisibility(bool isVisible);


//    Link& operator=(Link &b); //overload assignment

};


#endif // LINK_H
