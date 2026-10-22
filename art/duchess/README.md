# La Duchesse — Blender source

`duchess.blend` is the editable Blender 5.1 scene: a compact sculpted face with
painted complexion, inset almond eyes, swept ribbon locks, crown filigree, thick
velvet drapes, pleated ivory skirt, brocade sleeve inserts, lace and individual fingers.
The studio, camera and pedestal are included. The portrait is rendered with Cycles.
The supplied reference is packed into the scene as a viewport image guide.

Rebuild from the project root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python art/duchess/build_duchess.py
```

Add `-- --preview` to render without rebuilding the game exports.
Use `-- --draft` for a half-resolution preview in `art/duchess/preview.png`, or
`-- --no-render` to rebuild the editable scene and exports without a portrait render.

Generated outputs:

- `art/duchess/duchess.blend`: high resolution editable source, including the studio.
- `art/duchess/duchess.glb`: simplified character for interchange (the display pedestal is excluded).
- `src/assets/duchess/duchess-portrait.png`: transparent Cycles portrait used in the wardrobe.
- `src/assets/duchess/duchess.mesh.json`: packed, batched game mesh with painted colors and animation pivots.

The game export has approximately 106,000 triangles in 34 material/animation
batches (previously 139,107 triangles in 42 batches). Positions use 0.04 mm
quantization; normals stay normalized signed 16-bit values on the GPU, and each
batch uses 16-bit indices when possible. GPU geometry buffers total about 1.8 MB,
down from 3.4 MB, and the packed JSON is about 1.95 MB instead of 3.39 MB.

The eyes follow the actual face surface: painted iris fibres replace separate
tubes, and eyelids, brows and expression alternatives share the same fitting
transform. Hair shades, embroidered gold and velvet edging merge by compatible
material, with their colors preserved per vertex. Fabric and hair microstructure
in the Cycles portrait is studio-only; the runtime uses baked tonal variation,
without adding texture samplers or per-frame work.

The source sculpture is preserved before export simplification. The game adapter
in `src/render/models/duchess.ts` reuses its geometry across instances and binds
the head, arms, skirt, drapes and facial expression groups to the existing animations.
Both assets are embedded into the standalone offline build.

For an in-engine check, open `models-lab.html#area=joueur&heading=0&h=2.1&stats=1`.
The visible diagnostics report geometry buffers and batches for the Duchess and
all eight dishes. The accompanying procedural pass keeps every dish's triangle,
batch and GPU buffer counts unchanged. Foliage and table linen retain their
original topology and use the static batch's existing vertex-color attribute.
These are geometry-budget comparisons, not measurements on a physical iPhone.

Coordinates: Blender uses Z up and -Y front; game exports use Y up and +Z front.
All dimensions are in metres. The character is about 1.62 m tall.
