import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { Character, type CharacterProps } from '../mascot/Character'
import { INK, SHADOW } from '../mascot/toon'

// A character in the city: the same figure, but with soft vinyl surfaces that take the real light and cast a shadow,
// instead of the flat cartoon colors and ink lines.

const soft = new Map<string, THREE.MeshStandardMaterial>()

function softMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  const key = color.getHexString()
  let material = soft.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0, envMapIntensity: 0.9 })
    soft.set(key, material)
  }
  return material
}

export function SoftCharacter(props: CharacterProps) {
  const group = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    group.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (object.material === INK || object.material === SHADOW) object.visible = false
      else if (object.material instanceof THREE.MeshToonMaterial) {
        object.material = softMaterial(object.material.color)
        object.castShadow = true
      }
    })
  }, [props.look])
  return (
    <group ref={group}>
      <Character {...props} base={false} />
    </group>
  )
}
