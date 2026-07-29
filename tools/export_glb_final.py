import bpy
import sys

argv = sys.argv
output_path = argv[argv.index("--") + 1]

armature = bpy.data.objects.get("Armature")
if armature.instance_type != 'NONE':
    print(f"Fixing Armature.instance_type: {armature.instance_type!r} -> 'NONE'")
    armature.instance_type = 'NONE'

empty1 = bpy.data.objects.get("Empty.001")
if empty1 is not None and empty1.parent_bone == 'Bone.034' and 'Bone.034' not in armature.data.bones:
    print("Clearing bad bone-parent reference on Empty.001")
    empty1.parent_type = 'OBJECT'
    empty1.parent_bone = ''

# Only export the actual character: Armature + its skinned meshes.
# The source file also has unrelated scene dressing (Text watermark, a
# reference Plane, cameras/lights) in Collection 2 that isn't part of the
# character model.
coll2 = bpy.data.collections.get("Collection 2")
scene = bpy.context.scene
if coll2 is not None and coll2.name in [c.name for c in scene.collection.children]:
    scene.collection.children.unlink(coll2)
    print("Unlinked Collection 2 (Text/Plane/Camera dressing) from scene")

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_animations=True,
    export_apply=True,
    export_yup=True,
)
print("EXPORT_OK:", output_path)
