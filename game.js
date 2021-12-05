class Game {
    constructor() {
        if (!Detector.webgl) Detector.addGetWebGLMessage();

        this.container = document.createElement('div');
        this.container.style.height = '100%';
        document.body.appendChild(this.container);

        const game = this;

        for (let i = 0; i <= 16; i++) {
            let path;
            if (i < 10) {
                path = `${this.assetsPath}images/carparts000${i}.png`;
            } else {
                path = `${this.assetsPath}images/carparts00${i}.png`;
            }
            options.assets.push(path);
        }

        this.mode = this.modes.PRELOAD;
        this.motion = { forward: 0, turn: 0 };
        this.clock = new THREE.Clock();

        this.initSfx();

        this.carGUI = [0, 0, 0, 0, 0];

        if ('ontouchstart' in window) {
            document.getElementById('reset-btn').addEventListener('touchstart', function () { game.resetCar(); });
        } else {
            document.getElementById('reset-btn').onclick = function () { game.resetCar(); };
        }

        let index = 0;
        document.getElementById('part-select').childNodes.forEach(function (node) {
            if (node.nodeType == 1) {
                const i = index;
                node.onclick = function () {
                    game.carGUIHandler(i);
                };
                index++;
            }
        });

        document.getElementById('play-btn').onclick = function () { game.startGame(); };


        window.onError = function (error) {
            console.error(JSON.stringify(error));
        }
    }



    startGame() {
        this.sfx.click.play();
        const parts = ["a Body", "an Aerial", "an Engine", "an Exhaust", "some Wheels"];
        let index = 0;
        let configured = true;
        this.carGUI.forEach(function (item) {
            if (item == 0) {
                showMessage(`Please select ${parts[index]}`);
                configured = false;
            }
            index++;
        });

        if (!configured) {
            this.sfx.skid.play();
            return;
        }

        //Hide the GUI
        const gui = ["part-select", 'car-parts', 'message', 'play-btn'];
        gui.forEach(function (id) {
            document.getElementById(id).style.display = 'none';
        })

        document.getElementById('reset-btn').style.display = 'block';

        this.sfx.engine.play();
        this.init();
        this.animate();

        function showMessage(msg) {
            const elm = document.getElementById("message");
            elm.innerHTML = msg;
        }
    }

    makeWireframe(mode = true, model = this.assets) {
        const game = this;

        if (model.isMesh) {
            if (Array.isArray(model.material)) {
                model.material.forEach(function (material) { material.wireframe = mode; });
            } else {
                model.material.wireframe = mode;
            }
        }

        model.children.forEach(function (child) {
            if (child.children.length > 0) {
                game.makeWireframe(mode, child);
            } else if (child.isMesh) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(function (material) { material.wireframe = mode; });
                } else {
                    child.material.wireframe = mode;
                }
            }
        });
    }



    init() {
        this.mode = this.modes.INITIALISING;

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 500);
        this.camera.position.set(0, 6, -15);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        //this.scene.fog = new THREE.Fog( 0xa0a0a0, 20, 100 );

        // LIGHTS
        const ambient = new THREE.AmbientLight(0xaaaaaa);
        this.scene.add(ambient);

        const light = new THREE.DirectionalLight(0xaaaaaa);
        light.position.set(30, 100, 40);
        light.target.position.set(0, 0, 0);

        light.castShadow = true;

        this.sun = light;
        this.scene.add(light);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);


        this.loadAssets();

        window.addEventListener('resize', function () { game.onWindowResize(); }, false);

        // stats
        if (this.debug) {
            this.stats = new Stats();
            this.container.appendChild(this.stats.dom);
        }

        this.joystick = new JoyStick({
            game: this,
            onMove: this.joystickCallback
        })
    }

    loadAssets() {
        const game = this;
        const loader = new THREE.FBXLoader();

        loader.load('../assets/rc_time_trial.fbx',
            function (object) {
                let material, map, index, maps;
                const euler = new THREE.Euler();
                game.proxies = {};
                game.checkpoints = [];



                game.assets = object;
                game.scene.add(object);

                const tloader = new THREE.CubeTextureLoader();
                tloader.setPath('../assets/images/');

                var textureCube = tloader.load([
                    'px.jpg', 'nx.jpg',
                    'py.jpg', 'ny.jpg',
                    'pz.jpg', 'nz.jpg'
                ]);

                game.scene.background = textureCube;

                game.initPhysics();
            },
            null,
            function (error) {
                console.error(error);
            }
        );
    }

    updatePhysics() {
        if (this.physics.debugRenderer !== undefined) this.physics.debugRenderer.scene.visible = true;
    }

    initPhysics() {
        this.physics = {};

        const game = this;
        const mass = 150;
        const world = new CANNON.World();
        this.world = world;

        world.broadphase = new CANNON.SAPBroadphase(world);
        world.gravity.set(0, -10, 0);
        world.defaultContactMaterial.friction = 0;

        const groundMaterial = new CANNON.Material("groundMaterial");
        const wheelMaterial = new CANNON.Material("wheelMaterial");
        const wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
            friction: 0.3,
            restitution: 0,
            contactEquationStiffness: 1000
        });

        // We must add the contact materials to the world
        world.addContactMaterial(wheelGroundContactMaterial);

        //const chassisShape = this.createCannonConvex(this.proxies.car.geometry);
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.3, 2));
        const chassisBody = new CANNON.Body({ mass: mass });
        const pos = this.car.chassis.position.clone();
        pos.y += 1;
        chassisBody.addShape(chassisShape);
        chassisBody.position.copy(pos);
        chassisBody.angularVelocity.set(0, 0, 0);
        chassisBody.threemesh = this.car.chassis;

        this.followCam = new THREE.Object3D();
        this.followCam.position.copy(this.camera.position);
        this.scene.add(this.followCam);
        this.followCam.parent = chassisBody.threemesh;



        if (this.debugPhysics) this.debugRenderer = new THREE.CannonDebugRenderer(this.scene, this.world);
    }


    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    getAssetsByName(name) {
        if (this.assets == undefined) return;

        const names = name.split('.');
        let assets = this.assets;

        names.forEach(function (name) {
            if (assets !== undefined) {
                assets = assets.children.find(function (child) { return child.name == name; });
            }
        });

        return assets;
    }

    animate() {
        const game = this;

        requestAnimationFrame(function () { game.animate(); });

        const now = Date.now();
        if (this.lastTime === undefined) this.lastTime = now;
        const dt = (Date.now() - this.lastTime) / 1000.0;
        this.FPSFactor = dt;
        this.lastTime = now;

        if (this.world !== undefined) {
            this.updateDrive();

            this.world.step(this.fixedTimeStep, dt, 10);

            this.world.bodies.forEach(function (body) {
                if (body.threemesh != undefined) {
                    body.threemesh.position.copy(body.position);
                    body.threemesh.quaternion.copy(body.quaternion);
                    if (body == game.vehicle.chassisBody) {
                        const elements = body.threemesh.matrix.elements;
                        const yAxis = new THREE.Vector3(elements[4], elements[5], elements[6]);
                        body.threemesh.position.sub(yAxis.multiplyScalar(0.6));
                    }
                }
            });


        }

        this.updateCamera();

        if (this.debugRenderer !== undefined) this.debugRenderer.update();

        this.renderer.render(this.scene, this.camera);

        if (this.stats != undefined) this.stats.update();

    }
}
