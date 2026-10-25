# 工具配置说明文档

核查日期：2026-10-25。适用于支持工具包与六点标定的新版本 ROCOS-App / ROCOS-Viz。依据 App 文档、示例及实现整理；接口已通过 Apifox MCP 刷新并读取，API info.version 为 3.0.0。工具包版本、App/Viz 发布版本与 API 版本分别管理。

阅读顺序：首次制作工具包看第 1–4 节；部署和安装看第 5–6 节；标定、更新和迁移看第 7–8 节；接口接入与排错看第 9–10 节。

## 1. 先理解工具、模型和 TCP

| 概念 | 含义 |
| --- | --- |
| 普通工具 | 只配置法兰到 TCP 的固定变换，存入 frames.yaml 的 tools；没有工具包模型。 |
| 包工具 | 以一个工具名称绑定可复用 TCP 默认值及可选 URDF/STL 模型；与普通工具共用名称空间。 |
| 安装变换 mount（M） | 法兰坐标系 → 工具基座，也就是工具 URDF 根坐标系。 |
| 局部 TCP tcp（C） | 工具基座 → 工具中心点坐标系。 |
| 有效工具偏置 F | 法兰 → TCP，F = M × C；工具列表中的偏置仍是这个合成结果。 |
| 全局负载 | 质量和质心独立管理，不随命名 TCP 或工具包切换。 |

```text
模型位姿 = T_base_flange × M
实时 TCP = T_base_flange × M × C
六点标定得到 F 后，局部 TCP = M⁻¹ × F
```

矩阵乘法包含旋转，不能把两个 position 直接相加。比如安装和 TCP 都没有旋转，mount.z = 0.02 m、tcp.z = 0.14 m 时，法兰到 TCP 的 Z 偏移才是 0.16 m。

## 2. 工具包文件结构与 tool.yaml

```text
demo_gripper/
├── tool.yaml
├── gripper.urdf
└── meshes/
    └── finger.stl
```

tool.yaml 必须位于包根目录。下例来自 App 的 examples/tool_packages/demo_gripper/tool.yaml，可以配合该目录中的 URDF/STL 直接使用。

```yaml
schema_version: 1
name: demo_gripper
package_version: 1.0.0
model:
  urdf: gripper.urdf
mount:
  position: [0, 0, 0]
  orientation: [0, 0, 0, 1]
tcp:
  position: [0, 0, 0.14]
  orientation: [0, 0, 0, 1]
```

| 字段 | 要求与含义 |
| --- | --- |
| schema_version | 必填，当前支持 1，表示工具包清单格式版本。 |
| name | 必填，1–64 个 ASCII 字母、数字、点、下划线或短横；包名不能以点开头。ZIP 顶层目录名须与它一致。 |
| package_version | 必填，例如 1.0.0、1.0.1 或 1.0.1-rc.1。当前实现接受三段数字及可选预发布后缀，不接受 +build 后缀。 |
| model | 可选；省略时是只携带 TCP 的工具包。提供时，model.urdf 指向包内 .urdf 或 .xml 文件。 |
| mount | 可选，法兰到工具基座的变换；省略时为单位变换。 |
| tcp | 必填，工具基座到 TCP 的局部变换；不是已叠加安装的法兰到 TCP。 |
| position / orientation | 提供变换时必须包含 3 元素位置和 4 元素四元数；数值必须有限，四元数不能为零。 |

上例 TCP 是工具基座沿 +Z 方向 140 mm，不是 0.14 mm。若只需要 TCP，可删除 model 字段并只打包 tool.yaml；mount 也可省略。

## 3. URDF、STL 与单位约定

- 支持 URDF（.urdf/.xml）、STL 网格和 URDF 纯色材质。暂不支持 DAE、贴图或外部 URI；文件必须随包携带。
- URDF 需要 robot 元素及至少一个 link。工具根坐标系应与 mount、tcp 使用的工具基座定义一致。
- STL 自身没有长度单位。模型尺寸按米解释；若网格原始数值按毫米导出，在 URDF 的 mesh 上设置 scale="0.001 0.001 0.001"。已经按米导出的网格保持 scale="1 1 1"。
- 网格路径可相对 URDF 文件，也可用 package://工具名称/包内路径；后者的工具名称必须匹配 tool.yaml 的 name。
- Viz 当前按静态工具模型展示，工具包不包含夹爪开合控制。

```xml
<robot name="demo_gripper">
  <link name="gripper_base">
    <visual>
      <origin xyz="0 0 0.03"/>
      <geometry><box size="0.08 0.06 0.06"/></geometry>
      <material name="housing"><color rgba="0.18 0.35 0.6 1"/></material>
    </visual>
    <visual>
      <origin xyz="0.03 0 0.09"/>
      <geometry>
        <mesh filename="package://demo_gripper/meshes/finger.stl"/>
      </geometry>
    </visual>
  </link>
</robot>
```

| 位置 | 长度 / 姿态表示 |
| --- | --- |
| tool.yaml、frames.yaml、安装 YAML | 位置单位米；orientation: [x, y, z, w]。 |
| 工具相关 HTTP JSON Pose | 位置单位米；position: {x,y,z}、orientation: {x,y,z,w}，使用对象而非 YAML 数组。 |
| URDF | xyz 与几何尺寸按米；origin rpy 按弧度，是三个欧拉角。 |
| Viz 安装编辑界面 | XYZ 与 RX/RY/RZ 跟随全局长度/角度单位；界面完成单位和四元数转换。 |

orientation: [0, 0, 0, 1] 表示无旋转。不要把界面 RX/RY/RZ 或 URDF rpy 三元素直接填入 YAML 的 orientation。

## 4. 打包与首次导入

ZIP 必须只有一个命名顶层目录，目录名与 tool.yaml 的 name 一致。不能只压缩目录内部文件，也不能额外套一层 examples/tool_packages。

```bash
# 在 rocos-app 仓库中执行；ZIP 生成在 /tmp，不修改示例
cd examples/tool_packages
zip -r /tmp/demo_gripper.zip demo_gripper
unzip -l /tmp/demo_gripper.zip
```

上面是制作示例 ZIP 的参考命令，整理文档时未执行导入或机器人操作。

1. 确认压缩包和解压后的全部文件总量各不超过 64 MiB，文件数最多 512。
2. 避免链接、重复文件及越出包根的路径；仅包含模型和必要资源。
3. 连接支持工具包的 App，进入“IO 与设备 → 末端工具 → 工具包”。
4. 在具备控制权且机器人处于 IDLE/STOPPED 时，点击“导入工具 ZIP”选择文件。
5. 导入成功会注册到工具列表；需要使用时，再到“工具管理”明确“设为当前工具”。
6. 检查 3D 模型安装位置和 TCP 轴，再决定是否需要编辑安装或六点标定。

另一种方式是将完整命名目录放入控制器 robot.tool_library 指定的目录，再点击“扫描工具目录”。扫描的是控制器文件系统，不是浏览器电脑的本地目录。启动时也会扫描尚未注册的目录。

## 5. 控制器目录、frames.yaml 与本机配置

启动配置中的相关字段如下；这是 robot 配置的一部分，不应覆盖其他机器人配置。相对路径都以启动 YAML 所在目录为基准。

```yaml
robot:
  frames: frames.yaml
  id: default
  tool_library: ../tools
```

当启动文件是 rocos-app/config/config.yaml 时，以上路径分别指向 rocos-app/config/frames.yaml 和 rocos-app/tools/。不同机器人应使用不同且稳定的 robot.id，并配置各自的 frames 文件；robot.id 不依赖 IP。

```text
rocos-app/
├── config/
│   ├── config.yaml                # 启动入口与工具库位置
│   └── frames.yaml                # 当前机器人坐标系、活动选择及本机覆盖
└── tools/
    ├── demo_gripper/             # 可扫描的命名源目录（目录导入方式）
    │   ├── tool.yaml
    │   ├── gripper.urdf
    │   └── meshes/finger.stl
    └── .objects/
        └── demo_gripper/
            └── <SHA256>/        # 运行时不可变内容快照，由 App 管理
```

| frames.yaml 字段 | 说明 |
| --- | --- |
| tools.<name> | 普通工具的法兰到 TCP 变换，含 position / orientation。 |
| objects.<name> | 工件坐标系配置。 |
| active_tool / active_object | 活动工具 / 工件名称；空工具名称表示使用法兰。 |
| robot_id | 包工具绑定所属机器人，有包绑定时必须与当前控制器一致。 |
| package_tools.<name> | 保存 digest、package_version、mount、tcp、revision 和可选 calibration。模型资源不在此文件中。 |

tool.yaml 是可复用默认定义；frames.yaml 是本机运行配置；安装 YAML 是可导入导出的装配备份。三者用途不同。包工具不再作为普通 tools 条目重复保存合成偏置。

本机编辑和标定不会修改原始包。资源按工具库/.objects/名称/SHA256/ 保存快照；摘要覆盖包内全部文件，不能用 ZIP 文件本身的 SHA256 代替。修改源目录不会替换已经绑定的快照，重启也优先恢复原版本。

App 以临时文件、刷新同步和原子替换保存 frames.yaml；持久化失败时保留旧文件与内存状态。启动时允许 frames 文件不存在，已有文件解析或校验失败会终止初始化。

## 6. Viz 页面各操作的含义

| 操作 | 结果与注意事项 |
| --- | --- |
| 导入工具 ZIP | 注册新工具；相同内容重复导入保留本机覆盖和标定；不会自动激活。 |
| 扫描工具目录 | 扫描控制器工具库的命名目录；完整验证后提交；同名内容变更不能当作更新。 |
| 编辑安装与 TCP | 编辑本机 mount、局部 tcp；保存清除旧标定记录，工具包原件保持不变。 |
| 填写工具包默认值 | 将默认安装和局部 TCP 填入编辑表单；点击保存后才生效。 |
| 更新工具 ZIP | 要求同名新包版本不同，并匹配旧摘要；恢复新包默认安装/TCP，清除旧标定。 |
| 工具管理 → 设为当前工具 | 明确切换活动工具；选择包下拉框只选择编辑/导出对象。 |
| 导入安装配置 | 同机器人、同包版本和摘要时恢复覆盖及记录；不会切换活动工具。 |
| 删除包工具 | 解除本机绑定，必要时清除活动选择；不会删除不可变模型资源。 |

写入操作要求同时具备控制权的 token 和 client_id，且机器人处于 IDLE/STOPPED。列表、资源读取和导出是只读操作，不要求控制权且不续期。导入、编辑或保存本身不会发送运动命令。

截图中的“安装变换”和“局部 TCP”摘要只显示 XYZ 平移。即使都显示 0.000，也不能据此判断旋转一定为单位姿态，应打开编辑框查看 RX/RY/RZ。

## 7. 六点标定与包工具 TCP 保存

1. 固定安装方式和工具包版本；输入工具名称，设置最大误差，默认 1 mm。
2. P1–P4：使同一工具尖端对准同一固定参考点，以四种明显不同的法兰姿态采集。姿态过近不能可靠求解。
3. P4 同时作为方向原点；保持 P4 的法兰方向，沿期望工具 +X 移动后采集 P5，从 P4 沿期望工具 +Z 移动后采集 P6。
4. 每次调整后先停止，再采集真实关节与法兰数据。方向采集相对 P4 的姿态差不超过 1°；位移至少 1 mm，实际应明显大于该下限；X/Z 方向避免接近平行。
5. 六点齐全再计算，检查 RMS、最大误差和条件数；计算不会保存或激活工具。
6. 确认结果后“保存为工具”。包工具由服务端以 C = M⁻¹ × F 写入本机局部 TCP，避免重复叠加安装。需要使用时再明确激活。

重采集任一点会清除旧计算结果。会话固定工具包摘要与安装 revision；期间更新包、删除工具或编辑安装会使原会话失效，必须重新采集。会话只驻留内存，重启失效；断连、切换控制器或控制权变更时 Viz 清理本地草稿。

包工具标定记录包括 Unix 时间、robot_id、包摘要、标定时安装变换、法兰到 TCP 结果及误差指标。手动保存安装/TCP 会清除旧标定记录。模型只是可视化，不能替代现场 TCP 和机器人精度验收。

## 8. 更新、导出和恢复

| 导出入口 | 包含内容 | 适用场景 |
| --- | --- | --- |
| 导出原始工具包 | 原始模型、默认 mount 和默认局部 TCP；包内容摘要不变；不包含本机覆盖。 | 工具库备份、跨机器人复用。 |
| 导出含本机 TCP 的工具包 | 当前局部 TCP、新 package_version、原包默认 mount；不带本机 mount 覆盖和标定记录。 | 将经确认的局部 TCP 发布成可复用版本。 |
| 导出安装配置 | robot_id、包名/版本/摘要、本机 mount/tcp，以及可选标定记录。 | 当前机器人的装配备份。 |

“含本机 TCP”指当前局部 TCP，即使来自手工编辑也可导出；它不是法兰到 TCP 的合成偏置。导出时必须输入不同于原包的新版本；导出不会修改当前控制器的已安装版本。

### 8.1 更新同名工具包

1. 先导出当前安装配置，并保留旧原始工具包。
2. 修改包内容，同时修改 tool.yaml 的 package_version；保持工具名称与顶层目录一致。
3. 在 Viz 选择对应工具，使用“更新工具 ZIP”；不要依靠修改源目录后扫描。
4. 更新将使用新包默认 mount/tcp 并清除旧标定。重新检查安装和 TCP，必要时重新标定。

旧安装备份要求旧包摘要/版本，不能直接恢复到更新后的新包。需要回退时，应先用明确的更新流程恢复对应原始包，再导入匹配的安装配置。

### 8.2 恢复与跨机器人迁移

- 同机器人恢复：先确保安装了完全相同版本和摘要的工具包，再导入安装配置。robot_id、包名、版本、摘要都必须一致。
- 跨机器人复用：先导入原始工具 ZIP，再按目标机器人实际装配编辑 mount，重新检查或标定 TCP。不要把另一台机器人的安装 YAML 当作通用工具包。
- 完整备份：frames.yaml 不含模型资源；同时备份所需工具 ZIP 或整个工具库，保留恢复所需的不可变快照。

安装 YAML 的结构示意如下。package_digest 是控制器导出值；下面占位符不是可导入摘要。恢复时优先使用 Viz 导出的原文件。

```yaml
schema_version: 1
robot_id: default
name: demo_gripper
package_version: 1.0.0
package_digest: "<控制器导出的64位摘要>"
mount:
  position: [0, 0, 0]
  orientation: [0, 0, 0, 1]
tcp:
  position: [0, 0, 0.14]
  orientation: [0, 0, 0, 1]
# calibration: ...  # 若有标定记录，由控制器导出
```

注意：安装 YAML 使用 package_digest，而 frames.yaml 的 package_tools 条目和 HTTP 包元信息使用 digest。安装备份不是整个 frames.yaml，也不包含模型文件。

## 9. 开发接入索引与协议来源

本节是使用索引，完整协议以 Apifox 项目 8387612 的 ROCOS API 为准。本次已通过 MCP 刷新并读取相关 operation、Pose、工具包模型及鉴权定义，核查 API 版本为 3.0.0。本文不维护独立 OpenAPI 副本。

- [Apifox：ROCOS API 权威协议](https://app.apifox.com/project/8387612)

| 方法与路径 | 用途 / 关键输入 |
| --- | --- |
| GET /api/robot/tool_packages | 读取已注册包、library_path、robot_id。 |
| POST /api/robot/tool_packages/import | 原始 application/zip；同名更新 query expected_digest 匹配当前摘要。 |
| POST /api/robot/tool_packages/reload | 扫描工具库，JSON 请求体为 {}。 |
| POST /api/robot/tool_package/overrides | name、digest、revision、mount、tcp；后两项使用 JSON Pose。 |
| GET /api/robot/tool_package/asset | name、digest、path；路径相对包根。 |
| GET /api/robot/tool_package/export | name；默认导出原件；calibrated=true 加不同的新 package_version 导出当前局部 TCP。 |
| GET /api/robot/tool_package/installation | name；导出安装 YAML。 |
| POST /api/robot/tool_package/installation | 原始 application/yaml；恢复匹配包的本机配置。 |
| POST /api/calibration/save | session_id；保存成功计算的服务端结果。 |
| GET /api/robot/tool_frame | name；frame 始终是法兰到 TCP，包工具额外含 package 分量。 |
| GET /api/robot/tcp | 可选 name；读取基座到 TCP 的实时位姿，不改变活动选择。 |

写接口要求 X-Rocos-Control-Token 与 X-Rocos-Client-Id 同时存在。digest/revision 用于拒绝过期编辑。包工具不能使用普通 POST /api/robot/tool_frame 编辑或重命名；包工具覆盖与标定分别走专用接口。

成功的文件端点直接返回 ZIP、YAML、XML 或二进制资源；失败返回标准 JSON，即使 HTTP 200 也需检查 success/code。客户端不能只凭 HTTP 状态判断业务成功。

## 10. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 没有“工具包”页签 | 确认 App 支持工具包能力，并更新匹配的 Viz。 |
| ZIP 导入失败 | 检查唯一命名顶层目录、tool.yaml 必填字段、包名/版本、大小与文件数、资源路径和 STL 格式。 |
| 模型尺寸大或小 1000 倍 | 检查 STL 原始单位和 URDF mesh scale；按米解释尺寸。 |
| 模型位置正确，TCP 位置错误 | 检查 tcp 是否为工具基座到 TCP；避免重复叠加 mount，确认米与界面毫米的转换。 |
| TCP 正确，模型安装位置错误 | 检查 URDF 根坐标系、mount 及 visual origin；不要只改 TCP 去补偿模型。 |
| 手工改工具目录后不生效 | 当前绑定使用不可变快照；更新 package_version 后使用“更新工具 ZIP”。 |
| 安装配置无法导入 | 核对 robot_id、包名、package_version 和 package_digest 是否与已安装包一致。 |
| 保存提示过期编辑或标定会话失效 | 回读最新工具数据；安装或包发生变更后重新编辑，标定则重新采集。 |
| 切换工具后质量/质心没变 | 全局负载独立管理，切换工具不会自动设置负载。 |
| 写按钮不可用 / 写入失败 | 检查连接、控制权和 IDLE/STOPPED 状态；保存失败还需检查配置目录权限。 |

相关业务码：1001 参数或上下文无效；3006 缺少控制凭据；3007 凭据无效；4001 采集/计算结果不完整；4002 标定退化或误差超限；4004 会话失效；4005 状态不允许；文件或资源相关错误可能返回 -3001。结合返回 message 判断具体原因。

## 11. 资料来源与维护

内容基线：ROCOS-App a5bfefb、ROCOS-Viz 0b5d0f9 的文档与相关实现。App 工作区存在本机 config/frames.yaml，本指南没有复制其中的设备绑定或摘要；文中 YAML 均为通用示例。

- [App：工具包、安装覆盖与模型可视化](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/docs/tool_packages.md)

- [App：六点法标定与工具管理](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/docs/tool_calibration.md)

- [App：配置文件使用分析](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/docs/config_yaml_usage_analysis.md)

- [示例：tool.yaml](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/examples/tool_packages/demo_gripper/tool.yaml)

- [示例：gripper.urdf](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/examples/tool_packages/demo_gripper/gripper.urdf)

- [示例：finger.stl](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/examples/tool_packages/demo_gripper/meshes/finger.stl)

- [实现：包校验、版本、模型与导出](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/src/tool_package.cpp)

- [实现：注册表与安装备份格式](https://github.com/rocos-sia/rocos-app/blob/a5bfefb/src/frame_registry.cpp)

后续变更时，包格式与持久化行为对照 App 文档和实现，页面操作对照 Viz，接口重新通过 Apifox MCP 核查。本次同步只整理说明，不修改控制器配置或调用机器人控制接口。
