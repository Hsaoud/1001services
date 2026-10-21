# La Duchesse — Blender source

`duchess.blend` is the editable Blender 5.1 scene: sculpted face with painted
complexion, almond eyes, swept and grooved hair, crown filigree, thick subdivided
velvet drapes, pleated ivory skirt, slashed puff sleeves, lace and individual fingers.
The studio, camera and pedestal are included. The portrait is rendered with Cycles.
The supplied reference is packed into the scene as a viewport image guide.

Rebuild from the project root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python art/duchess/build_duchess.py
```

Add `-- --preview` to render without rebuilding the game exports.

Generated outputs:

- `art/duchess/duchess.blend`: high resolution editable source, including the studio.
- `art/duchess/duchess.glb`: simplified character for interchange (the display pedestal is excluded).
- `src/assets/duchess/duchess-portrait.png`: transparent Cycles portrait used in the wardrobe.
- `src/assets/duchess/duchess.mesh.json`: packed, batched game mesh with painted colors and animation pivots.

The game export has approximately 139,000 triangles in 42 material/animation
batches. Positions use 0.04 mm quantization; normals use signed 16-bit values.
The source sculpture is preserved before export simplification. The game adapter
in `src/render/models/duchess.ts` reuses its geometry across instances and binds
the head, arms, skirt, drapes and facial expression groups to the existing animations.
Both assets are embedded into the standalone offline build.

Coordinates: Blender uses Z up and -Y front; game exports use Y up and +Z front.
All dimensions are in metres. The character is about 1.62 m tall.
