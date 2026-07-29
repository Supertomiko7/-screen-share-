import bpy

print("=== OBJECTS ===")
for obj in bpy.data.objects:
    print(f"- {obj.name!r} type={obj.type} parent={obj.parent.name if obj.parent else None} "
          f"parent_type={obj.parent_type} parent_bone={obj.parent_bone!r} hide_viewport={obj.hide_viewport} hide_render={obj.hide_render} hide_get={obj.hide_get()}")
    for mod in obj.modifiers:
        extra = ""
        if mod.type == 'ARMATURE':
            extra = f" object={mod.object.name if mod.object else None}"
        print(f"    modifier: {mod.name} type={mod.type}{extra}")

print()
print("=== MESH OBJECTS DETAIL ===")
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        print(f"- {obj.name!r}: {len(obj.data.vertices)} verts, {len(obj.data.polygons)} polys, "
              f"vertex_groups={[vg.name for vg in obj.vertex_groups][:5]}{'...' if len(obj.vertex_groups) > 5 else ''} "
              f"(total {len(obj.vertex_groups)})")

print()
print("=== ARMATURES ===")
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        bones = obj.data.bones
        print(f"- {obj.name!r}: {len(bones)} bones")
        has_034 = 'Bone.034' in bones
        print(f"  has 'Bone.034': {has_034}")

print()
print("=== EMPTIES WITH BONE PARENT ===")
for obj in bpy.data.objects:
    if obj.parent_type == 'BONE':
        exists = False
        if obj.parent and obj.parent.type == 'ARMATURE':
            exists = obj.parent_bone in obj.parent.data.bones
        print(f"- {obj.name!r} parent={obj.parent.name if obj.parent else None} parent_bone={obj.parent_bone!r} bone_exists={exists}")

print()
print("=== COLLECTIONS / SCENE VISIBILITY ===")
for coll in bpy.data.collections:
    print(f"- collection {coll.name!r}: objects={[o.name for o in coll.objects]}")
print(f"scene collection objects: {[o.name for o in bpy.context.scene.collection.objects]}")
