(function () {
  "use strict";

  // ---------------- 配置 ----------------
  var GRID_SIZE = 8;
  var CELL_SIZE = 1;
  var STORAGE_PREFIX = "toy-world-editor-v1";
  var ACTIVE_SLOT_KEY = STORAGE_PREFIX + ":active-slot";
  var HINT_KEY = STORAGE_PREFIX + ":hint-seen";
  var TERRAIN_TYPES = ["grass", "path", "water"];
  var KIND_TYPES = ["rock", "tree", "house"];
  var TOOLS = [
    { id: "grass", label: "草地", type: "terrain", terrain: "grass" },
    { id: "path", label: "土路", type: "terrain", terrain: "path" },
    { id: "water", label: "水", type: "terrain", terrain: "water" },
    { id: "rock", label: "石头", type: "kind", kind: "rock" },
    { id: "tree", label: "树", type: "kind", kind: "tree" },
    { id: "house", label: "房子", type: "kind", kind: "house" },
    { id: "erase", label: "擦除", type: "erase" }
  ];
  var COLORS = {
    grass: 0x58be4a,
    grassSide: 0x3f983f,
    path: 0xc98844,
    pathSide: 0xa86f3a,
    water: 0x38aee8,
    waterLight: 0x8bdfff,
    rock: 0x9da3a7,
    rockDark: 0x777f86,
    trunk: 0x8b5633,
    leaf: 0x2f9d47,
    leafLight: 0x68c94c,
    houseA: 0xffc64f,
    houseB: 0xff8c42,
    roof: 0xe54836,
    board: 0xd99b55,
    boardSide: 0x9f683b,
    highlight: 0xfff3a4
  };

  var elements = {};
  var state = {
    world: createEmptyWorld(),
    activeSlot: 0,
    activeTool: "tree",
    hover: null,
    pointer: null,
    theta: -Math.PI / 4,
    phi: 0.72,
    radius: 9.4
  };
  var three = {};
  var cellGroups = [];
  var pickers = [];
  var miniCells = [];
  var batchDepth = 0;
  var batchDirty = false;
  var statusTimer = 0;

  if (!window.THREE) {
    document.getElementById("statusLine").textContent = "Three.js CDN 加载失败，请联网后重新打开。";
    return;
  }

  // ---------------- 工具函数 ----------------
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function cellKey(x, z) {
    return x + "," + z;
  }

  function inBounds(x, z) {
    return x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE;
  }

  function cellToWorld(value) {
    return (value - (GRID_SIZE - 1) / 2) * CELL_SIZE;
  }

  function seededNoise(x, z, salt) {
    var n = Math.sin((x + 1) * 127.1 + (z + 1) * 311.7 + salt * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ---------------- 场景 ----------------
  function initScene() {
    three.scene = new THREE.Scene();
    three.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    three.renderer = new THREE.WebGLRenderer({
      canvas: elements.canvas,
      alpha: true,
      antialias: true
    });
    three.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    three.renderer.setClearColor(0x000000, 0);
    three.renderer.shadowMap.enabled = true;
    three.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    three.renderer.outputEncoding = THREE.sRGBEncoding;

    three.worldGroup = new THREE.Group();
    three.pickerGroup = new THREE.Group();
    three.scene.add(three.worldGroup);
    three.scene.add(three.pickerGroup);

    makeMaterials();
    makeGeometries();
    makeBoard();
    makePickers();
    makeHover();
    updateCamera();
    resizeRenderer();
    window.addEventListener("resize", resizeRenderer);
  }

  function resizeRenderer() {
    var rect = elements.viewport.getBoundingClientRect();
    var width = Math.max(1, Math.floor(rect.width));
    var height = Math.max(1, Math.floor(rect.height));
    three.renderer.setSize(width, height, false);
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
  }

  function updateCamera() {
    var horizontal = Math.cos(state.phi) * state.radius;
    three.camera.position.set(
      Math.sin(state.theta) * horizontal,
      Math.sin(state.phi) * state.radius,
      Math.cos(state.theta) * horizontal
    );
    three.camera.lookAt(0, 0.05, 0);
  }

  function animate() {
    requestAnimationFrame(animate);
    three.renderer.render(three.scene, three.camera);
  }

  // ---------------- 光照 ----------------
  function initLights() {
    var hemi = new THREE.HemisphereLight(0xfff1cf, 0x93b86b, 0.54);
    three.scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xffd08a, 1.08);
    sun.position.set(-4.6, 8.5, 5.2);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 22;
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.radius = 4;
    three.scene.add(sun);

    var fill = new THREE.DirectionalLight(0x8fd6ff, 0.22);
    fill.position.set(4, 4, -6);
    three.scene.add(fill);
  }

  // ---------------- 数据 ----------------
  function createEmptyWorld() {
    var next = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      next[x] = [];
      for (var z = 0; z < GRID_SIZE; z += 1) {
        next[x][z] = { terrain: "grass", kind: null };
      }
    }
    return next;
  }

  function normalizeCell(cell) {
    var terrain = cell && TERRAIN_TYPES.indexOf(cell.terrain) !== -1 ? cell.terrain : "grass";
    var kind = cell && KIND_TYPES.indexOf(cell.kind) !== -1 ? cell.kind : null;
    if (terrain === "water") {
      kind = null;
    }
    return { terrain: terrain, kind: kind };
  }

  function setCell(x, z, nextValue) {
    if (!inBounds(x, z)) {
      return;
    }

    var current = normalizeCell(state.world[x][z]);
    var next = typeof nextValue === "function" ? nextValue(current) : nextValue;
    var merged = normalizeCell({
      terrain: Object.prototype.hasOwnProperty.call(next, "terrain") ? next.terrain : current.terrain,
      kind: Object.prototype.hasOwnProperty.call(next, "kind") ? next.kind : current.kind
    });

    state.world[x][z] = merged;
    batchDirty = true;

    if (batchDepth === 0) {
      renderCell(x, z);
      updateMiniCell(x, z);
      saveActiveWorld();
      batchDirty = false;
    }
  }

  function batchCells(callback, options) {
    var shouldSave = !options || options.save !== false;
    batchDepth += 1;
    try {
      callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && batchDirty) {
        rebuildWorld();
        updateMiniMap();
        if (shouldSave) {
          saveActiveWorld();
        }
        batchDirty = false;
      }
    }
  }

  function replaceWorld(source, shouldSave) {
    state.world = createEmptyWorld();
    batchCells(function () {
      for (var x = 0; x < GRID_SIZE; x += 1) {
        for (var z = 0; z < GRID_SIZE; z += 1) {
          setCell(x, z, normalizeCell(source && source[x] && source[x][z]));
        }
      }
    }, { save: shouldSave });
  }

  function clearWorld() {
    batchCells(function () {
      fillGrass();
    });
    showStatus("世界 " + (state.activeSlot + 1) + " 已清空");
  }

  function fillGrass() {
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        setCell(x, z, { terrain: "grass", kind: null });
      }
    }
  }

  // ---------------- 工厂 ----------------
  function makeMaterials() {
    function standard(color, options) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color: color,
        roughness: 0.72,
        metalness: 0.02
      }, options || {}));
    }

    three.materials = {
      grass: standard(COLORS.grass),
      grassSide: standard(COLORS.grassSide),
      path: standard(COLORS.path),
      water: standard(COLORS.water, { transparent: true, opacity: 0.88, roughness: 0.42 }),
      waterLight: standard(COLORS.waterLight, { transparent: true, opacity: 0.75, roughness: 0.32 }),
      rock: standard(COLORS.rock, { flatShading: true }),
      rockDark: standard(COLORS.rockDark, { flatShading: true }),
      trunk: standard(COLORS.trunk),
      leaf: standard(COLORS.leaf, { flatShading: true }),
      leafLight: standard(COLORS.leafLight, { flatShading: true }),
      houseA: standard(COLORS.houseA),
      houseB: standard(COLORS.houseB),
      roof: standard(COLORS.roof, { flatShading: true }),
      board: standard(COLORS.board),
      boardSide: standard(COLORS.boardSide),
      shadow: new THREE.ShadowMaterial({ color: 0x6f4f24, opacity: 0.2 }),
      picker: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      highlight: new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.48, depthWrite: false })
    };
  }

  function makeGeometries() {
    three.geometries = {
      tile: new THREE.BoxGeometry(0.92, 0.18, 0.92),
      waterTile: new THREE.BoxGeometry(0.92, 0.13, 0.92),
      wave: new THREE.BoxGeometry(0.42, 0.025, 0.055),
      board: new THREE.BoxGeometry(GRID_SIZE + 0.65, 0.36, GRID_SIZE + 0.65),
      boardTop: new THREE.BoxGeometry(GRID_SIZE + 0.84, 0.08, GRID_SIZE + 0.84),
      picker: new THREE.BoxGeometry(0.98, 0.18, 0.98),
      hover: new THREE.BoxGeometry(0.98, 0.035, 0.98),
      pathNick: new THREE.BoxGeometry(0.2, 0.018, 0.055),
      trunk: new THREE.CylinderGeometry(0.075, 0.095, 0.38, 8),
      treeCone: new THREE.ConeGeometry(0.33, 0.58, 7),
      rock: new THREE.IcosahedronGeometry(0.25, 0),
      houseBody: new THREE.BoxGeometry(0.56, 0.44, 0.56),
      roof: new THREE.ConeGeometry(0.47, 0.34, 4),
      chimney: new THREE.BoxGeometry(0.11, 0.19, 0.11)
    };
  }

  function mesh(geometry, material, castShadow, receiveShadow) {
    var next = new THREE.Mesh(geometry, material);
    next.castShadow = !!castShadow;
    next.receiveShadow = !!receiveShadow;
    return next;
  }

  function makeBoard() {
    var side = mesh(three.geometries.board, three.materials.boardSide, false, true);
    side.position.y = -0.28;
    three.scene.add(side);

    var top = mesh(three.geometries.boardTop, three.materials.board, false, true);
    top.position.y = -0.07;
    three.scene.add(top);
  }

  function makePickers() {
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        var picker = mesh(three.geometries.picker, three.materials.picker, false, false);
        picker.position.set(cellToWorld(x), 0.18, cellToWorld(z));
        picker.userData.x = x;
        picker.userData.z = z;
        pickers.push(picker);
        three.pickerGroup.add(picker);
      }
    }
  }

  function makeHover() {
    three.hoverMesh = mesh(three.geometries.hover, three.materials.highlight, false, false);
    three.hoverMesh.visible = false;
    three.hoverMesh.renderOrder = 10;
    three.scene.add(three.hoverMesh);
  }

  function terrainMaterial(cell) {
    if (cell.terrain === "path") {
      return three.materials.path;
    }
    if (cell.terrain === "water") {
      return three.materials.water;
    }
    return three.materials.grass;
  }

  function makeTerrain(cell, x, z) {
    var terrain = mesh(
      cell.terrain === "water" ? three.geometries.waterTile : three.geometries.tile,
      terrainMaterial(cell),
      false,
      true
    );
    terrain.position.y = cell.terrain === "water" ? -0.015 : 0;

    var group = new THREE.Group();
    group.add(terrain);

    if (cell.terrain === "water") {
      for (var i = 0; i < 2; i += 1) {
        var wave = mesh(three.geometries.wave, three.materials.waterLight, false, false);
        wave.position.set(-0.14 + i * 0.28, 0.075 + i * 0.006, -0.16 + seededNoise(x, z, i) * 0.34);
        wave.rotation.y = (seededNoise(x, z, i + 6) - 0.5) * 0.7;
        group.add(wave);
      }
    }

    if (cell.terrain === "path") {
      var nick = mesh(three.geometries.pathNick, three.materials.boardSide, false, false);
      nick.position.set(0.18, 0.102, -0.2);
      nick.rotation.y = 0.25;
      group.add(nick);
    }

    return group;
  }

  function makeRock(x, z) {
    var group = new THREE.Group();
    var first = mesh(three.geometries.rock, three.materials.rock, true, true);
    first.position.y = 0.27;
    first.scale.set(1.05, 0.78, 0.92);
    first.rotation.set(seededNoise(x, z, 1), seededNoise(x, z, 2) * Math.PI, 0.4);
    group.add(first);

    var second = mesh(three.geometries.rock, three.materials.rockDark, true, true);
    second.position.set(0.18, 0.2, 0.12);
    second.scale.set(0.58, 0.46, 0.56);
    second.rotation.set(0.2, seededNoise(x, z, 4) * Math.PI, 0.1);
    group.add(second);
    return group;
  }

  function makeTree(x, z) {
    var group = new THREE.Group();
    var trunk = mesh(three.geometries.trunk, three.materials.trunk, true, true);
    trunk.position.y = 0.28;
    group.add(trunk);

    var lower = mesh(three.geometries.treeCone, three.materials.leaf, true, true);
    lower.position.y = 0.62;
    lower.rotation.y = seededNoise(x, z, 3) * Math.PI;
    group.add(lower);

    var upper = mesh(three.geometries.treeCone, three.materials.leafLight, true, true);
    upper.position.y = 0.86;
    upper.scale.set(0.72, 0.72, 0.72);
    upper.rotation.y = Math.PI / 7 + seededNoise(x, z, 5) * Math.PI;
    group.add(upper);
    return group;
  }

  function makeHouse(x, z) {
    var group = new THREE.Group();
    var bodyMaterial = seededNoise(x, z, 8) > 0.45 ? three.materials.houseA : three.materials.houseB;
    var body = mesh(three.geometries.houseBody, bodyMaterial, true, true);
    body.position.y = 0.31;
    group.add(body);

    var roof = mesh(three.geometries.roof, three.materials.roof, true, true);
    roof.position.y = 0.7;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    var chimney = mesh(three.geometries.chimney, three.materials.boardSide, true, true);
    chimney.position.set(0.15, 0.79, -0.08);
    chimney.rotation.y = Math.PI / 4;
    group.add(chimney);
    return group;
  }

  function makeObject(kind, x, z) {
    if (kind === "rock") {
      return makeRock(x, z);
    }
    if (kind === "tree") {
      return makeTree(x, z);
    }
    if (kind === "house") {
      return makeHouse(x, z);
    }
    return null;
  }

  function renderCell(x, z) {
    if (!cellGroups[x]) {
      cellGroups[x] = [];
    }

    if (cellGroups[x][z]) {
      three.worldGroup.remove(cellGroups[x][z]);
      cellGroups[x][z] = null;
    }

    var cell = normalizeCell(state.world[x][z]);
    var group = new THREE.Group();
    group.position.set(cellToWorld(x), 0, cellToWorld(z));
    group.add(makeTerrain(cell, x, z));

    if (cell.kind) {
      var object = makeObject(cell.kind, x, z);
      if (object) {
        object.rotation.y = Math.round(seededNoise(x, z, 12) * 3) * (Math.PI / 2);
        group.add(object);
      }
    }

    cellGroups[x][z] = group;
    three.worldGroup.add(group);
  }

  function rebuildWorld() {
    for (var i = three.worldGroup.children.length - 1; i >= 0; i -= 1) {
      three.worldGroup.remove(three.worldGroup.children[i]);
    }
    cellGroups = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        renderCell(x, z);
      }
    }
    updateHoverMesh();
  }

  // ---------------- 交互 ----------------
  function initInteraction() {
    elements.viewport.addEventListener("pointerdown", onPointerDown);
    elements.viewport.addEventListener("pointermove", onPointerMove);
    elements.viewport.addEventListener("pointerup", onPointerUp);
    elements.viewport.addEventListener("pointercancel", onPointerCancel);
    elements.viewport.addEventListener("pointerleave", onPointerLeave);
    elements.viewport.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
    elements.viewport.addEventListener("wheel", onWheel, { passive: false });
  }

  function pointerToCell(event) {
    var rect = elements.canvas.getBoundingClientRect();
    var mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, three.camera);
    var hits = raycaster.intersectObjects(pickers, false);
    if (!hits.length) {
      return null;
    }
    return { x: hits[0].object.userData.x, z: hits[0].object.userData.z };
  }

  function setHover(cell) {
    var oldHover = state.hover;
    state.hover = cell;
    if (oldHover && (!cell || oldHover.x !== cell.x || oldHover.z !== cell.z)) {
      setMiniHover(oldHover.x, oldHover.z, false);
    }
    if (cell) {
      setMiniHover(cell.x, cell.z, true);
    }
    updateHoverMesh();
  }

  function updateHoverMesh() {
    if (!state.hover) {
      three.hoverMesh.visible = false;
      return;
    }
    three.hoverMesh.visible = true;
    three.hoverMesh.position.set(cellToWorld(state.hover.x), 0.155, cellToWorld(state.hover.z));
  }

  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    elements.viewport.setPointerCapture(event.pointerId);
    elements.viewport.classList.add("is-dragging");
    state.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      theta: state.theta,
      phi: state.phi,
      dragged: false
    };
    setHover(pointerToCell(event));
  }

  function onPointerMove(event) {
    if (state.pointer && state.pointer.id === event.pointerId) {
      var dx = event.clientX - state.pointer.x;
      var dy = event.clientY - state.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        state.pointer.dragged = true;
      }
      state.theta = state.pointer.theta - dx * 0.008;
      state.phi = clamp(state.pointer.phi + dy * 0.006, 0.34, 1.2);
      updateCamera();
      return;
    }
    setHover(pointerToCell(event));
  }

  function onPointerUp(event) {
    if (!state.pointer || state.pointer.id !== event.pointerId) {
      return;
    }
    elements.viewport.releasePointerCapture(event.pointerId);
    elements.viewport.classList.remove("is-dragging");
    var target = pointerToCell(event);
    if (!state.pointer.dragged && target) {
      applyTool(target.x, target.z);
      setHover(target);
    }
    state.pointer = null;
  }

  function onPointerCancel(event) {
    if (state.pointer && state.pointer.id === event.pointerId) {
      state.pointer = null;
      elements.viewport.classList.remove("is-dragging");
    }
  }

  function onPointerLeave() {
    if (!state.pointer) {
      setHover(null);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    state.radius = clamp(state.radius + event.deltaY * 0.005, 5.5, 13.5);
    updateCamera();
  }

  function applyTool(x, z) {
    var tool = TOOLS.find(function (item) {
      return item.id === state.activeTool;
    });
    if (!tool) {
      return;
    }

    if (tool.type === "terrain") {
      setCell(x, z, { terrain: tool.terrain, kind: null });
    } else if (tool.type === "kind") {
      setCell(x, z, function (cell) {
        return {
          terrain: cell.terrain === "water" ? "grass" : cell.terrain,
          kind: tool.kind
        };
      });
    } else {
      setCell(x, z, { terrain: "grass", kind: null });
    }
    showStatus("世界 " + (state.activeSlot + 1) + " 已保存");
  }

  // ---------------- 持久化 ----------------
  function slotKey(slot) {
    return STORAGE_PREFIX + ":slot-" + slot;
  }

  function saveActiveWorld() {
    try {
      localStorage.setItem(slotKey(state.activeSlot), JSON.stringify({ world: state.world }));
      localStorage.setItem(ACTIVE_SLOT_KEY, String(state.activeSlot));
    } catch (error) {
      showStatus("浏览器存储不可用");
    }
  }

  function loadSlot(slot) {
    state.activeSlot = clamp(slot, 0, 2);
    var loaded = null;
    try {
      var raw = localStorage.getItem(slotKey(state.activeSlot));
      if (raw) {
        var parsed = JSON.parse(raw);
        loaded = parsed && parsed.world;
      }
    } catch (error) {
      loaded = null;
    }

    if (loaded) {
      replaceWorld(loaded, false);
      showStatus("已打开世界 " + (state.activeSlot + 1));
    } else {
      generateVillage("世界 " + (state.activeSlot + 1) + " 已生成");
    }

    saveActiveWorld();
    updateSlotButtons();
  }

  function loadActiveSlot() {
    var savedSlot = 0;
    try {
      savedSlot = parseInt(localStorage.getItem(ACTIVE_SLOT_KEY), 10);
    } catch (error) {
      savedSlot = 0;
    }
    loadSlot(Number.isFinite(savedSlot) ? savedSlot : 0);
  }

  // ---------------- 程序化村庄 ----------------
  function generateVillage(message) {
    batchCells(function () {
      fillGrass();
      carvePond();
      var hub = findNearestLand({ x: randomInt(2, 5), z: randomInt(2, 5) });
      var entrance = findNearestLand({ x: Math.random() > 0.5 ? 0 : GRID_SIZE - 1, z: randomInt(1, GRID_SIZE - 2) });
      carvePath(entrance, hub);

      var houses = placeHouses(hub, randomInt(3, 4));
      houses.forEach(function (house) {
        carvePath(house.front, hub);
      });

      var pondEdge = findPondEdge(hub);
      if (pondEdge) {
        carvePath(pondEdge, hub);
      }

      placeRocks(randomInt(4, 6));
      placeTrees(randomInt(7, 10));
    });
    showStatus(message || "随机小村庄已生成");
  }

  function carvePond() {
    var center = { x: randomInt(2, 5), z: randomInt(2, 5) };
    var radius = 1.25 + Math.random() * 0.45;
    var pondCells = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        var dx = x - center.x;
        var dz = z - center.z;
        var wobble = seededNoise(x, z, Date.now() % 31) * 0.42;
        if (Math.sqrt(dx * dx + dz * dz) < radius + wobble) {
          pondCells.push({ x: x, z: z });
        }
      }
    }
    if (pondCells.length < 4) {
      pondCells.push(center, { x: center.x + 1, z: center.z }, { x: center.x, z: center.z + 1 }, { x: center.x - 1, z: center.z });
    }
    pondCells.slice(0, 8).forEach(function (cell) {
      if (inBounds(cell.x, cell.z)) {
        setCell(cell.x, cell.z, { terrain: "water", kind: null });
      }
    });
  }

  function findNearestLand(start) {
    var queue = [start];
    var seen = {};
    seen[cellKey(start.x, start.z)] = true;
    while (queue.length) {
      var next = queue.shift();
      if (inBounds(next.x, next.z) && state.world[next.x][next.z].terrain !== "water") {
        return next;
      }
      neighbors(next).forEach(function (candidate) {
        var key = cellKey(candidate.x, candidate.z);
        if (!seen[key] && inBounds(candidate.x, candidate.z)) {
          seen[key] = true;
          queue.push(candidate);
        }
      });
    }
    return { x: 0, z: 0 };
  }

  function findPondEdge(hub) {
    var best = null;
    var bestDistance = 99;
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        if (state.world[x][z].terrain === "water") {
          neighbors({ x: x, z: z }).forEach(function (neighbor) {
            if (!inBounds(neighbor.x, neighbor.z) || state.world[neighbor.x][neighbor.z].terrain === "water") {
              return;
            }
            var distance = Math.abs(neighbor.x - hub.x) + Math.abs(neighbor.z - hub.z);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = neighbor;
            }
          });
        }
      }
    }
    return best;
  }

  function neighbors(cell) {
    return shuffle([
      { x: cell.x + 1, z: cell.z },
      { x: cell.x - 1, z: cell.z },
      { x: cell.x, z: cell.z + 1 },
      { x: cell.x, z: cell.z - 1 }
    ]);
  }

  function findPath(start, end) {
    var queue = [start];
    var seen = {};
    var previous = {};
    var found = false;
    seen[cellKey(start.x, start.z)] = true;

    while (queue.length) {
      var current = queue.shift();
      if (current.x === end.x && current.z === end.z) {
        found = true;
        break;
      }
      neighbors(current).forEach(function (candidate) {
        var key = cellKey(candidate.x, candidate.z);
        if (!inBounds(candidate.x, candidate.z) || seen[key]) {
          return;
        }
        var cell = state.world[candidate.x][candidate.z];
        if (cell.terrain === "water" || cell.kind === "house") {
          return;
        }
        seen[key] = true;
        previous[key] = current;
        queue.push(candidate);
      });
    }

    if (!found) {
      return [];
    }

    var path = [];
    var cursor = end;
    var guard = GRID_SIZE * GRID_SIZE;
    while (cursor && guard > 0) {
      path.push(cursor);
      if (cursor.x === start.x && cursor.z === start.z) {
        return path.reverse();
      }
      cursor = previous[cellKey(cursor.x, cursor.z)];
      guard -= 1;
    }

    return [start];
  }

  function carvePath(start, end) {
    findPath(start, end).forEach(function (point) {
      var cell = state.world[point.x][point.z];
      if (cell.terrain !== "water" && cell.kind !== "house") {
        setCell(point.x, point.z, { terrain: "path", kind: null });
      }
    });
  }

  function placeHouses(hub, count) {
    var houses = [];
    var candidates = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        var cell = state.world[x][z];
        var distance = Math.abs(x - hub.x) + Math.abs(z - hub.z);
        if (cell.terrain !== "water" && cell.terrain !== "path" && !cell.kind && distance >= 2) {
          candidates.push({ x: x, z: z, distance: distance });
        }
      }
    }
    shuffle(candidates);

    candidates.forEach(function (candidate) {
      if (houses.length >= count) {
        return;
      }
      var tooClose = houses.some(function (house) {
        return Math.abs(house.x - candidate.x) + Math.abs(house.z - candidate.z) < 2;
      });
      if (tooClose) {
        return;
      }
      var front = bestFrontCell(candidate, hub);
      if (!front) {
        return;
      }
      setCell(candidate.x, candidate.z, { terrain: "grass", kind: "house" });
      houses.push({ x: candidate.x, z: candidate.z, front: front });
    });
    return houses;
  }

  function bestFrontCell(cell, hub) {
    var options = neighbors(cell).filter(function (candidate) {
      return inBounds(candidate.x, candidate.z) && state.world[candidate.x][candidate.z].terrain !== "water" && !state.world[candidate.x][candidate.z].kind;
    });
    options.sort(function (a, b) {
      var da = Math.abs(a.x - hub.x) + Math.abs(a.z - hub.z);
      var db = Math.abs(b.x - hub.x) + Math.abs(b.z - hub.z);
      return da - db;
    });
    return options[0] || null;
  }

  function placeRocks(count) {
    var cluster = { x: randomInt(1, 6), z: randomInt(1, 6) };
    var candidates = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        var cell = state.world[x][z];
        var distance = Math.abs(x - cluster.x) + Math.abs(z - cluster.z);
        if (cell.terrain === "grass" && !cell.kind && distance <= 3) {
          candidates.push({ x: x, z: z, distance: distance });
        }
      }
    }
    candidates.sort(function (a, b) {
      return a.distance - b.distance + (Math.random() - 0.5);
    });
    candidates.slice(0, count).forEach(function (candidate) {
      setCell(candidate.x, candidate.z, { terrain: "grass", kind: "rock" });
    });
  }

  function placeTrees(count) {
    var candidates = [];
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        var cell = state.world[x][z];
        if (cell.terrain === "grass" && !cell.kind) {
          candidates.push({ x: x, z: z });
        }
      }
    }
    shuffle(candidates).slice(0, count).forEach(function (candidate) {
      setCell(candidate.x, candidate.z, { terrain: "grass", kind: "tree" });
    });
  }

  // ---------------- 小地图 ----------------
  function initMiniMap() {
    elements.miniMap.innerHTML = "";
    miniCells = [];
    for (var z = 0; z < GRID_SIZE; z += 1) {
      for (var x = 0; x < GRID_SIZE; x += 1) {
        var cell = document.createElement("div");
        cell.className = "mini-cell terrain-grass";
        cell.setAttribute("aria-hidden", "true");
        elements.miniMap.appendChild(cell);
        if (!miniCells[x]) {
          miniCells[x] = [];
        }
        miniCells[x][z] = cell;
      }
    }
  }

  function updateMiniMap() {
    for (var x = 0; x < GRID_SIZE; x += 1) {
      for (var z = 0; z < GRID_SIZE; z += 1) {
        updateMiniCell(x, z);
      }
    }
  }

  function updateMiniCell(x, z) {
    var target = miniCells[x] && miniCells[x][z];
    if (!target) {
      return;
    }
    var cell = normalizeCell(state.world[x][z]);
    target.className = "mini-cell terrain-" + cell.terrain + (cell.kind ? " kind-" + cell.kind : "");
    if (state.hover && state.hover.x === x && state.hover.z === z) {
      target.classList.add("is-hover");
    }
  }

  function setMiniHover(x, z, active) {
    var target = miniCells[x] && miniCells[x][z];
    if (target) {
      target.classList.toggle("is-hover", active);
    }
  }

  // ---------------- 界面 ----------------
  function initUI() {
    renderSlotButtons();
    renderToolButtons();
    elements.resetButton.addEventListener("click", function () {
      generateVillage("随机小村庄已生成");
    });
    elements.clearButton.addEventListener("click", clearWorld);
  }

  function renderSlotButtons() {
    elements.slotButtons.innerHTML = "";
    for (var slot = 0; slot < 3; slot += 1) {
      var button = document.createElement("button");
      button.className = "slot-button";
      button.type = "button";
      button.textContent = "世界 " + (slot + 1);
      button.dataset.slot = String(slot);
      button.addEventListener("click", function (event) {
        loadSlot(parseInt(event.currentTarget.dataset.slot, 10));
      });
      elements.slotButtons.appendChild(button);
    }
  }

  function updateSlotButtons() {
    Array.prototype.forEach.call(elements.slotButtons.children, function (button) {
      var isActive = parseInt(button.dataset.slot, 10) === state.activeSlot;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderToolButtons() {
    elements.toolGrid.innerHTML = "";
    TOOLS.forEach(function (tool) {
      var button = document.createElement("button");
      var swatch = document.createElement("span");
      var label = document.createElement("span");
      button.className = "tool-button";
      button.type = "button";
      button.dataset.tool = tool.id;
      button.setAttribute("aria-pressed", tool.id === state.activeTool ? "true" : "false");
      swatch.className = "tool-swatch " + tool.id;
      label.className = "tool-label";
      label.textContent = tool.label;
      button.appendChild(swatch);
      button.appendChild(label);
      button.addEventListener("click", function (event) {
        state.activeTool = event.currentTarget.dataset.tool;
        updateToolButtons();
      });
      elements.toolGrid.appendChild(button);
    });
    updateToolButtons();
  }

  function updateToolButtons() {
    Array.prototype.forEach.call(elements.toolGrid.children, function (button) {
      var isActive = button.dataset.tool === state.activeTool;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function showStatus(message) {
    elements.statusLine.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      elements.statusLine.textContent = "当前工具：" + toolLabel(state.activeTool);
    }, 1800);
  }

  function toolLabel(id) {
    var tool = TOOLS.find(function (item) {
      return item.id === id;
    });
    return tool ? tool.label : "";
  }

  function showFirstHint() {
    var shouldShow = false;
    try {
      shouldShow = localStorage.getItem(HINT_KEY) !== "1";
      localStorage.setItem(HINT_KEY, "1");
    } catch (error) {
      shouldShow = true;
    }
    if (!shouldShow) {
      return;
    }
    elements.hint.classList.add("is-visible");
    window.setTimeout(function () {
      elements.hint.classList.add("is-fading");
      elements.hint.classList.remove("is-visible");
    }, 3600);
  }

  // ---------------- 启动 ----------------
  function boot() {
    elements = {
      viewport: document.getElementById("viewport"),
      canvas: document.getElementById("worldCanvas"),
      hint: document.getElementById("hint"),
      slotButtons: document.getElementById("slotButtons"),
      toolGrid: document.getElementById("toolGrid"),
      miniMap: document.getElementById("miniMap"),
      resetButton: document.getElementById("resetButton"),
      clearButton: document.getElementById("clearButton"),
      statusLine: document.getElementById("statusLine")
    };

    initScene();
    initLights();
    initMiniMap();
    initUI();
    initInteraction();
    loadActiveSlot();
    showFirstHint();
    showStatus("当前工具：" + toolLabel(state.activeTool));
    animate();
  }

  boot();
}());
