(function() {
    'use strict';

    // ============ 配置常量 ============
    const SIZE = 8;
    const WORLD_KEY_PREFIX = 'mini_world_';

    // ============ 数据结构 ============
    let world = [];
    let currentWorld = 1;

    // ============ Three.js 变量 ============
    let scene, camera, renderer, controls;
    let islandGroup;
    let hoverBox;
    let tiles = [];
    let topMap = {};
    let clickableObjects = [];
    let raycaster, mouse;
    let currentTool = 'grass';
    let time = 0;

    // ============ 工具定义 ============
    const tools = [
        { id: 'water', icon: '💧', name: '水', color: '#4da6ff' },
        { id: 'grass', icon: '🌱', name: '草地', color: '#42b842' },
        { id: 'dirt', icon: '🟫', name: '土路', color: '#8b5a2b' },
        { id: 'stone', icon: '🪨', name: '石头', color: '#999999' },
        { id: 'tree', icon: '🌳', name: '树', color: '#2f8f2f' },
        { id: 'house', icon: '🏠', name: '房子', color: '#d9924a' },
        { id: 'erase', icon: '🧹', name: '擦除', color: '#cc3333' }
    ];

    // ============ 材质 ============
    let materials;

    // ============ 几何对象 ============
    let cube;

    // ============ 初始化启动 ============
    function init() {
        initWorldData();
        initScene();
        initLights();
        initGeometries();
        initMaterials();
        initWorldObjects();
        initDecorations();
        initHoverBox();
        initRaycaster();
        initUI();
        initEventListeners();
        loadWorld();
        renderWorld();
        animate();
    }

    // ============ 数据结构初始化 ============
    function initWorldData() {
        world = [];
        for (let x = 0; x < SIZE; x++) {
            world[x] = [];
            for (let z = 0; z < SIZE; z++) {
                world[x][z] = { terrain: 'grass', kind: null };
            }
        }
    }

    // ============ 场景初始化 ============
    function initScene() {
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0xbfe9ff, 20, 80);

        camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(12, 12, 14);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setClearColor(0x87ceeb, 1);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 8;
        controls.maxDistance = 30;
    }

    // ============ 光照初始化 ============
    function initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);

        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(10, 20, 10);
        light.castShadow = true;
        scene.add(light);
    }

    // ============ 几何体初始化 ============
    function initGeometries() {
        cube = new THREE.BoxGeometry(1, 1, 1);
    }

    // ============ 材质初始化 ============
    function initMaterials() {
        function material(color) {
            return new THREE.MeshLambertMaterial({
                color: color,
                flatShading: true
            });
        }

        materials = {
            grass: material(0x42b842),
            dirt: material(0x8b5a2b),
            water: material(0x4da6ff),
            stone: material(0x999999),
            wood: material(0x7b4d20),
            leaves: material(0x2f8f2f),
            house: material(0xd9924a),
            roof: material(0xaa3333),
            island: material(0x704321),
            border: new THREE.LineBasicMaterial({ color: 0xcfcfcf })
        };
    }

    // ============ 世界对象初始化 ============
    function initWorldObjects() {
        islandGroup = new THREE.Group();
        scene.add(islandGroup);

        tiles = [];
        topMap = {};
        clickableObjects = [];

        const layers = [
            { size: 10, y: -0.6 },
            { size: 8, y: -1.8 },
            { size: 6, y: -3.0 }
        ];
        
        layers.forEach(layer => {
            const islandLayer = new THREE.Mesh(
                new THREE.BoxGeometry(layer.size, 1.2, layer.size),
                materials.island
            );
            islandLayer.position.y = layer.y;
            islandLayer.castShadow = true;
            islandLayer.receiveShadow = true;
            islandGroup.add(islandLayer);
        });

        for (let x = 0; x < SIZE; x++) {
            for (let z = 0; z < SIZE; z++) {
                const wx = pos(x);
                const wz = pos(z);

                const middle = new THREE.Mesh(cube, materials.grass);
                middle.position.set(wx, -0.3, wz);
                middle.userData = { x, z, layer: 'ground' };

                const border = new THREE.LineSegments(
                    new THREE.EdgesGeometry(cube),
                    materials.border
                );

                middle.add(border);
                islandGroup.add(middle);

                tiles.push(middle);
                clickableObjects.push(middle);
            }
        }
    }

    // ============ 装饰初始化 ============
    let clouds = [];
    
    function initDecorations() {
        function createCloud(x, y, z, scale = 1) {
            const group = new THREE.Group();
            
            const cloudParts = [
                { pos: [0, 0, 0], scale: [1.2, 0.8, 1.2] },
                { pos: [0.8, 0.1, 0.3], scale: [0.9, 0.7, 0.9] },
                { pos: [-0.7, 0.15, -0.2], scale: [0.8, 0.6, 0.8] },
                { pos: [0.3, 0.25, 0.8], scale: [0.7, 0.5, 0.7] },
                { pos: [-0.4, 0.2, -0.7], scale: [0.7, 0.5, 0.7] },
                { pos: [0.9, 0.3, -0.5], scale: [0.5, 0.4, 0.5] },
                { pos: [-0.9, 0.35, 0.4], scale: [0.5, 0.4, 0.5] }
            ];
            
            cloudParts.forEach(part => {
                const mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.5 * scale, 16, 12),
                    new THREE.MeshLambertMaterial({ color: 0xffffff })
                );
                mesh.position.set(
                    part.pos[0] * scale,
                    part.pos[1] * scale,
                    part.pos[2] * scale
                );
                mesh.scale.set(
                    part.scale[0] * scale,
                    part.scale[1] * scale,
                    part.scale[2] * scale
                );
                mesh.castShadow = true;
                mesh.receiveShadow = false;
                group.add(mesh);
            });
            
            group.position.set(x, y, z);
            group.userData = { 
                speedX: (Math.random() - 0.5) * 0.015,
                speedZ: (Math.random() - 0.5) * 0.015,
                initialX: x,
                initialY: y,
                initialZ: z,
                range: 30 + Math.random() * 20
            };
            scene.add(group);
            return group;
        }

        clouds = [
            createCloud(-12, 11, -12, 1.3),
            createCloud(8, 13, -9, 1.1),
            createCloud(-7, 10, 10, 1.0),
            createCloud(15, 12, 5, 0.8),
            createCloud(-15, 9, 0, 1.2),
            createCloud(0, 14, -15, 1.0),
            createCloud(5, 11, 12, 0.9)
        ];
    }

    // ============ 悬停框初始化 ============
    function initHoverBox() {
        hoverBox = new THREE.Mesh(
            new THREE.BoxGeometry(1.06, 1.06, 1.06),
            new THREE.MeshBasicMaterial({
                color: 0xffff00,
                wireframe: true,
                transparent: true,
                opacity: 0.9
            })
        );
        hoverBox.visible = false;
        islandGroup.add(hoverBox);
    }

    // ============ 射线检测初始化 ============
    function initRaycaster() {
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
    }

    // ============ UI初始化 ============
    function initUI() {
        initToolbar();
        initControls();
        initWorldSelector();
    }

    function initToolbar() {
        const toolbar = document.getElementById('toolbar');
        toolbar.innerHTML = '';

        tools.forEach(tool => {
            const div = document.createElement('div');
            div.className = 'tool';
            div.style.background = tool.color;
            
            const iconSpan = document.createElement('span');
            iconSpan.className = 'tool-icon';
            iconSpan.innerText = tool.icon;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'tool-name';
            nameSpan.innerText = tool.name;
            
            div.appendChild(iconSpan);
            div.appendChild(nameSpan);

            if (tool.id === currentTool) {
                div.classList.add('active');
            }

            div.onclick = () => {
                currentTool = tool.id;
                document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
                div.classList.add('active');
            };

            toolbar.appendChild(div);
        });
    }

    function initControls() {
        document.getElementById('reset').addEventListener('click', generateVillage);
        document.getElementById('clear').addEventListener('click', clearWorld);
    }

    function initWorldSelector() {
        const worldButtons = document.querySelectorAll('.world-selector button');
        worldButtons.forEach(btn => {
            if (parseInt(btn.dataset.world) === currentWorld) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                worldButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentWorld = parseInt(btn.dataset.world);
                loadWorld();
                renderWorld();
            });
        });
    }

    // ============ 事件监听 ============
    function initEventListeners() {
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('resize', onWindowResize);
    }

    function updateMousePosition(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function getHoveredTile(event) {
        updateMousePosition(event);
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(tiles, false);
        return hits.length > 0 ? hits[0].object : null;
    }

    function onPointerMove(event) {
        const target = getHoveredTile(event);
        if (!target) {
            hoverBox.visible = false;
            return;
        }
        const x = target.userData.x;
        const z = target.userData.z;
        hoverBox.visible = true;
        hoverBox.position.set(pos(x), 0, pos(z));
    }

    function onPointerDown(event) {
        if (event.button !== 0) return;
        const tile = getHoveredTile(event);
        if (!tile) return;
        const x = tile.userData.x;
        const z = tile.userData.z;
        setCell(x, z, currentTool);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ============ 辅助函数 ============
    function pos(v) {
        return v - SIZE / 2 + 0.5;
    }

    // ============ 唯一写入入口 ============
    function setCell(x, z, tool) {
        const cell = world[x][z];

        if (tool === 'erase') {
            cell.terrain = 'grass';
            cell.kind = null;
        } else if (tool === 'grass' || tool === 'dirt' || tool === 'water') {
            cell.terrain = tool;
            cell.kind = null;
        } else {
            cell.kind = tool;
        }

        saveWorld();
        renderWorld();
    }

    // ============ 工厂函数 - 创建/移除对象 ============
    function removeTop(x, z) {
        const key = x + '_' + z;
        const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);

        if (!tile) return;
        tile.material = materials.grass;

        if (topMap[key]) {
            islandGroup.remove(topMap[key]);
            const index = clickableObjects.indexOf(topMap[key]);
            if (index > -1) {
                clickableObjects.splice(index, 1);
            }
            delete topMap[key];
        }
    }

    function setTerrain(x, z, type) {
        removeTop(x, z);
        const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);

        if (!tile) return;

        if (type === 'grass') tile.material = materials.grass;
        if (type === 'dirt') tile.material = materials.dirt;
        if (type === 'water') tile.material = materials.water;
    }

    function createStone(x, z) {
        const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);
        if (!tile) return;

        const oldTop = topMap[x + '_' + z];
        if (oldTop) islandGroup.remove(oldTop);

        const group = new THREE.Group();

        const rock1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.8), materials.stone);
        rock1.position.y = 0.25;

        const rock2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.45), materials.stone);
        rock2.position.set(-0.15, 0.62, 0.1);

        const rock3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), materials.stone);
        rock3.position.set(0.2, 0.78, -0.08);

        [rock1, rock2, rock3].forEach(mesh => {
            const border = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), materials.border);
            mesh.add(border);
            group.add(mesh);
        });

        group.position.set(pos(x), 0, pos(z));
        group.userData = { x, z };
        islandGroup.add(group);
        topMap[x + '_' + z] = group;
        if (!clickableObjects.includes(group)) {
            clickableObjects.push(group);
        }
    }

    function createTree(x, z) {
        const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);
        if (!tile) return;

        const oldTop = topMap[x + '_' + z];
        if (oldTop) islandGroup.remove(oldTop);

        const group = new THREE.Group();

        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), materials.wood);
        trunk.position.y = 0.55;

        const leavesBottom = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), materials.leaves);
        leavesBottom.position.y = 1.15;

        const leavesMiddle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), materials.leaves);
        leavesMiddle.position.y = 1.55;

        const leavesTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), materials.leaves);
        leavesTop.position.y = 1.9;

        [trunk, leavesBottom, leavesMiddle, leavesTop].forEach(mesh => {
            const border = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), materials.border);
            mesh.add(border);
            group.add(mesh);
        });

        group.position.set(pos(x), 0, pos(z));
        group.userData = { x, z };
        islandGroup.add(group);
        topMap[x + '_' + z] = group;
        if (!clickableObjects.includes(group)) {
            clickableObjects.push(group);
        }
    }

    function createHouse(x, z) {
        const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);
        if (!tile) return;

        const oldTop = topMap[x + '_' + z];
        if (oldTop) islandGroup.remove(oldTop);

        const group = new THREE.Group();

        const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.75, 1.05), materials.house);
        base.position.y = 0.38;

        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), materials.roof);
        roof.position.y = 1.05;
        roof.rotation.y = Math.PI / 4;

        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), materials.stone);
        chimney.position.set(0.24, 1.15, 0);

        const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.05), materials.wood);
        door.position.set(0, 0.12, 0.53);

        const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), materials.water);
        window1.position.set(-0.28, 0.35, 0.53);

        const window2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), materials.water);
        window2.position.set(0.28, 0.35, 0.53);

        [base, chimney, door, window1, window2].forEach(mesh => {
            const border = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), materials.border);
            mesh.add(border);
            group.add(mesh);
        });
        group.add(roof);

        group.position.set(pos(x), 0, pos(z));
        group.userData = { x, z };
        islandGroup.add(group);
        topMap[x + '_' + z] = group;
        if (!clickableObjects.includes(group)) {
            clickableObjects.push(group);
        }
    }

    // ============ 世界渲染 ============
    function renderWorld() {
        for (let x = 0; x < SIZE; x++) {
            for (let z = 0; z < SIZE; z++) {
                const cell = world[x][z];
                const tile = tiles.find(t => t.userData.x === x && t.userData.z === z);

                if (tile) {
                    if (cell.terrain === 'grass') {
                        tile.material = materials.grass;
                    } else if (cell.terrain === 'dirt') {
                        tile.material = materials.dirt;
                    } else if (cell.terrain === 'water') {
                        tile.material = materials.water;
                    }

                    if (cell.kind) {
                        if (cell.kind === 'stone') createStone(x, z);
                        else if (cell.kind === 'tree') createTree(x, z);
                        else if (cell.kind === 'house') createHouse(x, z);
                    } else {
                        const key = x + '_' + z;
                        if (topMap[key]) {
                            islandGroup.remove(topMap[key]);
                            delete topMap[key];
                        }
                    }
                }
            }
        }
    }

    // ============ 持久化 ============
    function saveWorld() {
        const worldData = JSON.stringify(world);
        localStorage.setItem(WORLD_KEY_PREFIX + currentWorld, worldData);
    }

    function loadWorld() {
        const saved = localStorage.getItem(WORLD_KEY_PREFIX + currentWorld);
        if (saved) {
            world = JSON.parse(saved);
        } else {
            initWorldData();
        }
    }

    function clearWorld() {
        initWorldData();
        saveWorld();
        renderWorld();
    }

    function generateVillage() {
        initWorldData();

        const pondX = Math.floor(Math.random() * (SIZE - 3)) + 1;
        const pondZ = Math.floor(Math.random() * (SIZE - 3)) + 1;
        for (let dx = 0; dx < 2; dx++) {
            for (let dz = 0; dz < 2; dz++) {
                world[pondX + dx][pondZ + dz].terrain = 'water';
            }
        }

        const centerX = Math.floor(SIZE / 2);
        const centerZ = Math.floor(SIZE / 2);
        for (let x = 0; x < SIZE; x++) {
            if (world[x][centerZ].terrain === 'grass') {
                world[x][centerZ].terrain = 'dirt';
            }
        }
        for (let z = 0; z < SIZE; z++) {
            if (world[centerX][z].terrain === 'grass') {
                world[centerX][z].terrain = 'dirt';
            }
        }

        const houseCount = Math.floor(Math.random() * 3) + 2;
        for (let h = 0; h < houseCount; h++) {
            let hx, hz;
            do {
                hx = Math.floor(Math.random() * SIZE);
                hz = Math.floor(Math.random() * SIZE);
            } while (world[hx][hz].kind !== null || world[hx][hz].terrain === 'water');
            world[hx][hz].kind = 'house';

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const nx = hx + dx;
                    const nz = hz + dz;
                    if (nx >= 0 && nx < SIZE && nz >= 0 && nz < SIZE) {
                        if (world[nx][nz].terrain === 'grass' && world[nx][nz].kind === null) {
                            world[nx][nz].terrain = 'dirt';
                        }
                    }
                }
            }
        }

        const stoneCount = Math.floor(Math.random() * 4) + 2;
        const stoneCenterX = Math.floor(Math.random() * (SIZE - 2)) + 1;
        const stoneCenterZ = Math.floor(Math.random() * (SIZE - 2)) + 1;
        for (let s = 0; s < stoneCount; s++) {
            const sx = (stoneCenterX + (s % 2)) % SIZE;
            const sz = (stoneCenterZ + Math.floor(s / 2)) % SIZE;
            if (world[sx][sz].kind === null && world[sx][sz].terrain !== 'water') {
                world[sx][sz].kind = 'stone';
            }
        }

        const treeCount = Math.floor(Math.random() * 5) + 4;
        for (let t = 0; t < treeCount; t++) {
            let tx, tz;
            do {
                tx = Math.floor(Math.random() * SIZE);
                tz = Math.floor(Math.random() * SIZE);
            } while (world[tx][tz].kind !== null || world[tx][tz].terrain === 'water');
            world[tx][tz].kind = 'tree';
        }

        saveWorld();
        renderWorld();
    }

    // ============ 动画循环 ============
    function animate() {
        requestAnimationFrame(animate);
        time += 0.01;
        islandGroup.position.y = Math.sin(time) * 0.2;
        
        clouds.forEach(cloud => {
            const data = cloud.userData;
            cloud.position.x += data.speedX;
            cloud.position.z += data.speedZ;
            
            if (Math.abs(cloud.position.x - data.initialX) > data.range) {
                data.speedX *= -1;
            }
            if (Math.abs(cloud.position.z - data.initialZ) > data.range) {
                data.speedZ *= -1;
            }
            
            cloud.position.y = cloud.userData.initialY + Math.sin(time * 0.5) * 0.3;
        });
        
        controls.update();
        renderer.render(scene, camera);
    }

    window.addEventListener('load', init);
})();