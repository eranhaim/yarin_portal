# Model tools

Scripts that make the 3D models in `client/public/` light enough for phones. Run `npm install` here first.

| Script | Input | Output |
|---|---|---|
| `people.mjs <in> <out> [ids]` | the `models/*.glb` of [avatar-studio](https://github.com/memoriesrohit/avatar-studio) (Microsoft Rocketbox, MIT) | `client/public/people/<id>.glb`: 6 moves, 4 face shapes, 1024 px color / 512 px detail textures, meshopt |
| `car.mjs <in> <out>` | `Models/CarConcept/glTF-WEBP/CarConcept.gltf` of the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (CC BY 4.0) | `client/public/car/car.glb`: no logos, no hidden parts, merged by material, about 61k triangles |
| `car-lod.mjs <in> <out>` | the same car | `client/public/car/car-lod.glb`: five merged parts for traffic, about 2.8k triangles |

After a change, bump `MODELS_VERSION` in `client/src/components/person/people.ts`, so browsers load the new files.
The thumbnails in `client/public/people/thumbs/` are avatar-studio's `models/thumbs/*.jpg`.
