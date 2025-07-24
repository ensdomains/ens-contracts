export function urgArtifact(name) {
  return new URL(
    `../../node_modules/@unruggable/gateways/artifacts/${name}.sol/${name}.json`,
    import.meta.url,
  )
}
