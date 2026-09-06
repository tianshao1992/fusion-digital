import type {
  Group,
  Material,
  Object3D,
  Texture,
} from 'three';

type ThreeRuntime = typeof import('three');

export const EXL50U_PRESENTATION_IDENTITY = {
  kind: 'presentation-identity',
  label: 'EXL-50U',
  flag: 'People\'s Republic of China',
  authority: 'illustrative',
  engineeringUseAllowed: false,
  evidenceBoundary: 'Added presentation geometry; not part of the source CAD or engineering assembly.',
} as const;

export const PRC_FLAG_CONSTRUCTION_GRID = {
  width: 30,
  height: 20,
  largeStar: { x: 5, y: 5, radius: 3 },
  smallStars: [
    { x: 10, y: 2, radius: 1 },
    { x: 12, y: 4, radius: 1 },
    { x: 12, y: 7, radius: 1 },
    { x: 10, y: 9, radius: 1 },
  ],
} as const;

export type Exl50uPresentationIdentityLayout = Readonly<{
  anchor: readonly [number, number, number];
  orientationY: number;
  unit: number;
  flagWidth: number;
  flagHeight: number;
  poleHeight: number;
  signWidth: number;
  signHeight: number;
  signOffset: readonly [number, number, number];
}>;

export type Exl50uPresentationIdentity = Readonly<{
  root: Group;
  materials: readonly Material[];
  textures: readonly Texture[];
}>;

// Presentation mount for the locked 2026-06-30 anonymous derivative, in its
// common-origin metre frame (Y up). A downward triangle probe at the pole
// hits the host's upper platform at Y=2.996 m. These are visual
// mounting coordinates, not engineering installation dimensions. Never use
// the full hall's max Y (8.845 m) or centre to locate equipment on the host.
export const EXL50U_HOST_TOP_MOUNT = {
  anchor: [1.65, 2.996, 1.65] as const,
  orientationY: Math.PI / 4,
  unitMetres: 1.2,
} as const;

export function resolveExl50uPresentationIdentityLayout(): Exl50uPresentationIdentityLayout {
  const unit = EXL50U_HOST_TOP_MOUNT.unitMetres;
  return {
    anchor: EXL50U_HOST_TOP_MOUNT.anchor,
    // The sign faces the existing three-quarter camera but remains physical
    // scene geometry as the visitor orbits around the installation.
    orientationY: EXL50U_HOST_TOP_MOUNT.orientationY,
    unit,
    flagWidth: unit * 1.26,
    flagHeight: unit * (1.26 * 2 / 3),
    poleHeight: unit * 1.55,
    signWidth: unit * 1.36,
    signHeight: unit * 0.38,
    // Below and outside the upper guardrail, in front of its diagonal frame
    // post. The flag retains its independent top-platform placement.
    signOffset: [0, 1.45 - EXL50U_HOST_TOP_MOUNT.anchor[1], 1.06],
  };
}

function drawFivePointStar(
  context: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  outerRadius: number,
  rotation: number,
) {
  const innerRadius = outerRadius * 0.381966;
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + index * Math.PI / 5;
    const x = centreX + Math.cos(angle) * radius;
    const y = centreY + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
}

function createChineseFlagTexture(THREE: ThreeRuntime, anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 600;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for the EXL-50U presentation flag.');

  context.fillStyle = '#de2910';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const fabricLight = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  fabricLight.addColorStop(0, 'rgba(255,255,255,0.10)');
  fabricLight.addColorStop(0.38, 'rgba(255,255,255,0.00)');
  fabricLight.addColorStop(0.72, 'rgba(80,0,0,0.10)');
  fabricLight.addColorStop(1, 'rgba(255,255,255,0.05)');
  context.fillStyle = fabricLight;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#ffde00';
  const gridScale = canvas.width / PRC_FLAG_CONSTRUCTION_GRID.width;
  const largeStar = PRC_FLAG_CONSTRUCTION_GRID.largeStar;
  const largeStarX = largeStar.x * gridScale;
  const largeStarY = largeStar.y * gridScale;
  drawFivePointStar(
    context,
    largeStarX,
    largeStarY,
    largeStar.radius * gridScale,
    -Math.PI / 2,
  );
  for (const star of PRC_FLAG_CONSTRUCTION_GRID.smallStars) {
    const x = star.x * gridScale;
    const y = star.y * gridScale;
    drawFivePointStar(
      context,
      x,
      y,
      star.radius * gridScale,
      Math.atan2(largeStarY - y, largeStarX - x),
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'FusionDigital:EXL50U:presentation-national-flag';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.needsUpdate = true;
  return texture;
}

function createExl50uLogoTexture(THREE: ThreeRuntime, anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for the EXL-50U presentation logo.');

  const plate = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  plate.addColorStop(0, '#f6f8f6');
  plate.addColorStop(0.55, '#dfe5e3');
  plate.addColorStop(1, '#b8c3c0');
  context.fillStyle = plate;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#a51f1b';
  context.fillRect(0, 0, 28, canvas.height);
  context.fillStyle = '#236b54';
  context.fillRect(28, canvas.height - 18, canvas.width - 28, 18);
  context.strokeStyle = 'rgba(25,42,48,0.36)';
  context.lineWidth = 7;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#173d6d';
  context.font = '900 164px "Arial Narrow", "DIN Condensed", Arial, sans-serif';
  context.fillText('EXL-50U', canvas.width * 0.52, canvas.height * 0.45);
  context.fillStyle = '#344c53';
  context.font = '700 38px "Arial Narrow", Arial, sans-serif';
  context.fillText('INTEGRATED ASSEMBLY  /  DIGITAL TWIN', canvas.width * 0.52, canvas.height * 0.79);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'FusionDigital:EXL50U:presentation-logo';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.needsUpdate = true;
  return texture;
}

function suppressPresentationPicking(root: Object3D) {
  root.traverse((node) => {
    node.raycast = () => undefined;
    node.userData = {
      ...node.userData,
      presentationOnly: true,
      engineeringAuthority: false,
    };
  });
}

export function createExl50uPresentationIdentity(
  THREE: ThreeRuntime,
  anisotropy: number,
): Exl50uPresentationIdentity {
  const layout = resolveExl50uPresentationIdentityLayout();
  const root = new THREE.Group();
  root.name = 'FUSIONDIGITAL_EXL50U_IDENTITY_MARKER';
  root.position.set(...layout.anchor);
  root.rotation.y = layout.orientationY;
  root.userData = { ...EXL50U_PRESENTATION_IDENTITY };

  const flagTexture = createChineseFlagTexture(THREE, anisotropy);
  const logoTexture = createExl50uLogoTexture(THREE, anisotropy);
  const poleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6f7d7f,
    metalness: 0.7,
    roughness: 0.38,
    envMapIntensity: 0.3,
  });
  poleMaterial.name = 'FusionDigital:EXL50U:presentation-identity-pole';
  const flagMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: flagTexture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  flagMaterial.name = 'FusionDigital:EXL50U:presentation-national-flag';
  const plateMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x778481,
    metalness: 0.2,
    roughness: 0.7,
    envMapIntensity: 0.22,
  });
  plateMaterial.name = 'FusionDigital:EXL50U:presentation-logo-plate';
  const logoMaterial = new THREE.MeshBasicMaterial({
    color: 0xdfe5e3,
    map: logoTexture,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  logoMaterial.name = 'FusionDigital:EXL50U:presentation-logo-face';

  const poleX = -layout.flagWidth * 0.55;
  const poleRadius = layout.unit * 0.032;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(poleRadius, poleRadius * 1.08, layout.poleHeight, 16),
    poleMaterial,
  );
  pole.name = 'EXL50U_PRESENTATION_FLAG_POLE';
  pole.position.set(poleX, layout.poleHeight * 0.5, 0);
  root.add(pole);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(poleRadius * 1.8, 16, 10), poleMaterial);
  finial.name = 'EXL50U_PRESENTATION_FLAG_FINIAL';
  finial.position.set(poleX, layout.poleHeight + poleRadius * 0.9, 0);
  root.add(finial);

  const flagGeometry = new THREE.PlaneGeometry(layout.flagWidth, layout.flagHeight, 24, 8);
  const flagPosition = flagGeometry.getAttribute('position');
  for (let index = 0; index < flagPosition.count; index += 1) {
    const x = flagPosition.getX(index);
    const y = flagPosition.getY(index);
    const along = (x + layout.flagWidth * 0.5) / layout.flagWidth;
    const wave = Math.sin(along * Math.PI * 2.2 + y * 1.7) * layout.unit * 0.038 * along;
    flagPosition.setZ(index, wave);
  }
  flagPosition.needsUpdate = true;
  flagGeometry.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeometry, flagMaterial);
  flag.name = 'EXL50U_PRESENTATION_NATIONAL_FLAG';
  flag.position.set(
    poleX + layout.flagWidth * 0.5 + poleRadius * 0.7,
    layout.poleHeight - layout.flagHeight * 0.5 - layout.unit * 0.08,
    0,
  );
  root.add(flag);

  const sign = new THREE.Group();
  sign.name = 'EXL50U_PRESENTATION_FRAME_MOUNTED_LOGO';
  sign.position.set(...layout.signOffset);
  root.add(sign);
  const plateDepth = layout.unit * 0.045;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(layout.signWidth * 1.035, layout.signHeight * 1.08, plateDepth),
    plateMaterial,
  );
  plate.name = 'EXL50U_PRESENTATION_LOGO_PLATE';
  sign.add(plate);

  for (const side of [-1, 1] as const) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(layout.signWidth, layout.signHeight), logoMaterial);
    face.name = side === 1 ? 'EXL50U_PRESENTATION_LOGO_FRONT' : 'EXL50U_PRESENTATION_LOGO_BACK';
    face.position.set(0, 0, side * (plateDepth * 0.5 + layout.unit * 0.002));
    if (side === -1) face.rotation.y = Math.PI;
    face.renderOrder = 3;
    sign.add(face);
  }

  // Two short rear brackets enter the diagonal exterior frame post instead
  // of unsupported feet on the deck. Public-GLB inward probes at Y=1.31/1.59 m
  // locate the post/beam near X=Z=2.109/2.284 m. The sign clears both at
  // X=Z=2.400 m; unequal stand-offs follow the stepped frame surface.
  for (const [y, bracketDepth] of [[-0.14, 0.45], [0.14, 0.22]]) {
    const support = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.07, bracketDepth),
      poleMaterial,
    );
    support.name = 'EXL50U_PRESENTATION_LOGO_REAR_BRACKET';
    support.position.set(0, y, -plateDepth * 0.5 - bracketDepth * 0.5);
    sign.add(support);
  }

  suppressPresentationPicking(root);
  return {
    root,
    materials: [poleMaterial, flagMaterial, plateMaterial, logoMaterial],
    textures: [flagTexture, logoTexture],
  };
}
