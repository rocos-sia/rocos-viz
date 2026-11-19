import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { previewFlange, matrixPose, poseMatrix } from '../src/dualarm/scene/frames.ts';

test('chain-local pose cancels a translated and rotated shared base',()=>{
  const robot=new Group(),base=new Group(),left=new Group(),right=new Group();
  base.position.set(3,4,5);base.rotation.z=Math.PI/2;
  left.position.set(.4,.2,.3);left.rotation.x=.25;right.position.set(-.7,.1,.6);
  robot.add(base);base.add(left,right);robot.links={base_link:base,Left_Link7:left,Right_Link7:right};
  const pose=previewFlange(robot,'left');
  for(const [key,value] of Object.entries({x:.4,y:.2,z:.3}))assert.ok(Math.abs(pose.position[key]-value)<1e-12);
  const rightPose=previewFlange(robot,'right');
  left.position.y+=.3;left.rotation.y=.2;
  assert.deepEqual(previewFlange(robot,'right'),rightPose);
  assert.notDeepEqual(previewFlange(robot,'left'),pose);
  delete robot.links.Left_Link7;assert.equal(previewFlange(robot,'left'),null);
});
test('pose matrices preserve orientation and SI length; reject invalid definitions',()=>{
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.8);
  const matrix=new Matrix4().compose(new Vector3(.1,.2,.3),q,new Vector3(1,1,1));
  const result=poseMatrix(matrixPose(matrix));
  matrix.elements.forEach((value,i)=>assert.ok(Math.abs(value-result.elements[i])<1e-12));
  assert.equal(poseMatrix(null),null);
  assert.equal(poseMatrix({position:{x:0,y:0,z:0},orientation:{x:0,y:0,z:0,w:0}}),null);
  assert.equal(poseMatrix({position:{x:NaN,y:0,z:0},orientation:{x:0,y:0,z:0,w:1}}),null);
});

test('independent shoulder bases return arm-local feedback and cancel scene transforms',()=>{
  const robot=new Group(),root=new Group(),leftBase=new Group(),rightBase=new Group();
  const left=new Group(),right=new Group();
  root.position.set(1,2,3);root.rotation.z=.4;
  leftBase.position.set(.011578,-.063,.091501);
  rightBase.position.set(.011578,-.267,.091501);
  left.position.set(.4,.2,.3);right.position.set(.3,-.2,.4);
  robot.add(root);root.add(leftBase,rightBase);leftBase.add(left);rightBase.add(right);
  robot.links={base_link:root,left_base:leftBase,right_base:rightBase,Left_Link7:left,Right_Link7:right};
  const chains={left:{base:'left_base',tip:'Left_Link7'},right:{base:'right_base',tip:'Right_Link7'}};
  for(const side of ['left','right']){
    const legacy=poseMatrix(previewFlange(robot,side));
    const local=poseMatrix(previewFlange(robot,side,chains));
    const base=side==='left'?leftBase:rightBase;
    const restored=base.matrix.clone().multiply(local);
    legacy.elements.forEach((value,i)=>assert.ok(Math.abs(value-restored.elements[i])<1e-12));
  }
  const before=previewFlange(robot,'right',chains);
  left.rotation.y=.5;
  assert.deepEqual(previewFlange(robot,'right',chains),before);
  delete robot.links.left_base;
  assert.equal(previewFlange(robot,'left',chains),null);
});
