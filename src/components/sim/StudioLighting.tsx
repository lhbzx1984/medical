"use client";

// 摄影棚式灯光：程序化室内环境光（IBL，不依赖外部 HDR）+ 主光 / 补光 / 轮廓光。
// 全身概览、器官特写与手术规划的器官视图共用，让湿润的器官与皮肤有可信的高光与反射。
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { setSceneEnvironment } from "./realistic-materials";

const ENVIRONMENT_INTENSITY = 0.55;

export function StudioLighting() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(room, 0.04);
    const previous = { texture: scene.environment, intensity: scene.environmentIntensity };
    setSceneEnvironment(scene, target.texture, ENVIRONMENT_INTENSITY);
    return () => {
      setSceneEnvironment(scene, previous.texture, previous.intensity);
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);

  return (
    <>
      <directionalLight color="#fff1e6" intensity={2} position={[2.5, 4, 3]} />
      <directionalLight color="#9fd8ff" intensity={0.5} position={[-3, 2, -2.5]} />
      <directionalLight color="#ffd7c4" intensity={0.9} position={[-1.5, 2.5, -3]} />
      <hemisphereLight args={["#bcd9ff", "#1a2233", 0.25]} />
    </>
  );
}
