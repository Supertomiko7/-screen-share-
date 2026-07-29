import bpy
import sys

argv = sys.argv
output_path = argv[argv.index("--") + 1]

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_animations=True,
    export_apply=True,
    export_yup=True,
)
print("EXPORT_OK:", output_path)
