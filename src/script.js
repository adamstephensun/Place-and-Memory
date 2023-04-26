import './style.css'
import * as THREE from 'three'
import * as dat from 'lil-gui'
import * as CANNON from 'cannon-es'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import CannonDebugger from 'cannon-es-debugger'
import { WebUSB, DAPLink } from 'dapjs'
//import * as DAPjs from 'dapjs/types/index.d.ts'

// vars /-/-/-/-/-/-/-/
let helvetikerFont, loraFont, spaceMonoFont, futuraFont, fontsLoaded, styleNum
let world, defaultMaterial, defaultContactMaterial, stonePhysMaterial, stoneContactMaterial, cannonDebugger
let activeCamera
let minX, maxX, minY, maxY  //Stores the min and max X and Y world postions of the edges of the screen
let sleepingBodies = 0

const fontsToLoad = 4

let useOrtho = true
let fontLoadFlag = false
let canSendColMessage = true
let mbConnectedFirstTime = false

const objectsToUpdate = []
const fonts = []
const letters  = []
const textures = []     // list of lists of textures
const opsTutorialStrings = []
const userTutorialStrings = []

const p_textures = []
const h_textures = []
const o_textures = []
const e_textures = []
const n_textures = []
const i_textures = []
const x_textures = []

const sizes = { width: window.innerWidth, height: window.innerHeight}
const aspectRatio = sizes.width / sizes.height
const mouse = new THREE.Vector2()

const parameters = {
    toggleCam: () => {
        useOrtho = !useOrtho
        updateCamType()
    },
    earthquake: () => {
        earthquake()
    },
    randomise: () => {
        resetAll()
    },
    connectWebUSB: () => {
        clickConnectWebUSB()
    },
    sendWebUSB: () => {
        clickSendWebUSB()
    },
    toggleCumulative: () => {
        sendCumulativeMessage()
    },
    cannonDebugEnabled: false,
    typeInput: false,
    mouseGravity: false,
    MBGravity: false,
    collisionVisualisation: false,
    earthquakeForce: 0,
    gravityLimit: 1,
    LEDOffset: 0
}

const colours = [
    new THREE.Color(0x354544),  // grey green
    new THREE.Color(0x3C680F),  // verdant green
    new THREE.Color(0x245F1F),  // letter green
    new THREE.Color(0x201E5D),  // dark purple
    new THREE.Color(0x5D2548),  // strong purple
    new THREE.Color(0x773F86),  // medium purple
    new THREE.Color(0x484677),  // light purple
    new THREE.Color(0xC34B78),  // strong pink
    new THREE.Color(0x1D5B66),  // teal
    new THREE.Color(0x1F7DB3),  // lighter blue
    //new THREE.Color(0x1B273F),  // darkish blue
    new THREE.Color(0x6C462F),  // brown
    new THREE.Color(0xE96D13),  // nba orange
    new THREE.Color(0x6C462F)   //nba purple
]

const bgColours = [
    new THREE.Color(0xBEB3B1),
    new THREE.Color(0xC3BBB0),
    new THREE.Color(0xCAC9C5),
    //new THREE.Color(0x1B273F)       // dark blue
]

const xPositions = [-1, -0.7, -0.4, -0.1, 0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2]   //List of x positions to cycle through when spawning letters with type input

// render /-/-/-/-/-/-/-/

const canvas = document.querySelector('canvas.webgl')
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// scene and cameras /-/-/-/-/-/-/-/

const scene = new THREE.Scene()
scene.background = getRandomListElement(bgColours)

const orthoCamera = new THREE.OrthographicCamera(-1 * aspectRatio, 1 * aspectRatio, 1, -1, 0.1, 2)
scene.add(orthoCamera)
orthoCamera.position.set(0, 0, 1)

const perspectiveCamera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
perspectiveCamera.position.set(- 3, 5, 3)
scene.add(perspectiveCamera)

if(useOrtho) activeCamera = orthoCamera
else activeCamera = perspectiveCamera

const controls = new OrbitControls(perspectiveCamera, canvas)
controls.enableDamping = true

// lights /-/-/-/-/-/-/-/
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
scene.add(ambientLight)

// loaders /-/-/-/-/-/-/-/
const fontLoader = new FontLoader()
const texLoader = new THREE.TextureLoader()

const mat = new THREE.MeshBasicMaterial({ color: colours[2] })

// init calls /-/-/-/-/-/-/-/
initPhysics()
loadFonts()
loadTextures()

// Sounds /////
const hitSound = new Audio('/sounds/hit.mp3')

const playHitSound = (collision) =>
{
    const impactStrength = collision.contact.getImpactVelocityAlongNormal()

    if(impactStrength > 1.5)
    {
        hitSound.volume = Math.random()
        hitSound.currentTime = 0
        hitSound.play()
    }
}

// debug /-/-/-/-/-/-/-/
const debugGui = new dat.GUI()          // debug gui contains stuff for testing purposes
const deploymentGui = new dat.GUI()     // deployment gui contains just the connectWebUSB button for ease of use for operations team
debugGui.hide()

deploymentGui.add(parameters, "connectWebUSB")

debugGui.add(parameters, 'earthquake')
debugGui.add(parameters, 'toggleCam')
debugGui.add(parameters, 'randomise')
debugGui.add(parameters, 'toggleCumulative')
debugGui.add(parameters, 'cannonDebugEnabled')
debugGui.add(parameters, 'collisionVisualisation')
debugGui.add(parameters, 'mouseGravity').onChange( function(){setGravity(0,-1)})  // reset the gravity to default when toggled
debugGui.add(parameters, 'MBGravity').onChange( function(){setGravity(0,-1)})
debugGui.add(parameters, 'earthquakeForce').min(0).max(10).step(1)
debugGui.add(parameters, 'gravityLimit').min(0).max(10).step(1)
debugGui.add(parameters, 'LEDOffset').min(0).max(150).step(1)

function initPhysics(){
    // Physics /////
    world = new CANNON.World()
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = true
    setGravity(0, 0)

    defaultMaterial = new CANNON.Material('default')
    defaultContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial,
        defaultMaterial,
        {
            friction: 0.1,
            restitution: 0.7
        }
    )
    world.defaultContactMaterial = defaultContactMaterial

    stonePhysMaterial = new CANNON.Material('stone')
    stoneContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial,
        stonePhysMaterial,
        {
            friction: 1,
            restitution: 0
        }
    )
    world.addContactMaterial(stoneContactMaterial)

    cannonDebugger = new CannonDebugger(scene, world)
}

function loadFonts(){   // load and store all fonts, called once
    fontsLoaded = 0
    fontLoadFlag = false
    fontLoader.load("fonts/helvetiker_regular.typeface.json", (font) => {
        console.log('Helvetiker font loaded')
    
        helvetikerFont = font
        fonts.push(helvetikerFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })

    fontLoader.load("fonts/Lora_Regular.json", (font) => {
        console.log("Lora font loaded")

        loraFont = font
        fonts.push(loraFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })

    fontLoader.load("fonts/Space Mono_Regular.json", (font) => {
        console.log("Space mono font loaded")

        spaceMonoFont = font
        fonts.push(spaceMonoFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })

    fontLoader.load("fonts/Futura Md BT_Medium.json", (font) => {
        console.log("Futura font loaded")

        futuraFont = font
        fonts.push(futuraFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })
}

function loadTextures(){
    styleNum = 10
    for (var i = 0; i < styleNum; i++){    // 3 == number of styles for each letter
        p_textures.push(texLoader.load('sprites/p/' + i + '.png'))
        h_textures.push(texLoader.load('sprites/h/' + i + '.png'))
        o_textures.push(texLoader.load('sprites/o/' + i + '.png'))
        e_textures.push(texLoader.load('sprites/e/' + i + '.png'))
        n_textures.push(texLoader.load('sprites/n/' + i + '.png'))
        i_textures.push(texLoader.load('sprites/i/' + i + '.png'))
        x_textures.push(texLoader.load('sprites/x/' + i + '.png'))
        textures.push(p_textures)
        textures.push(h_textures)
        textures.push(o_textures)
        textures.push(e_textures)
        textures.push(n_textures)
        textures.push(i_textures)
        textures.push(x_textures)
    }
    console.log("Sprite textures and materials loaded")
}

function onFontsLoaded(){
    if(!parameters.typeInput){
        //createLetter("P", getRandomListElement(fonts), new THREE.Vector3(-1.2, 0, 0))
        //createLetter("h", getRandomListElement(fonts), new THREE.Vector3(0, 0, 0))
        //createLetter("o", getRandomListElement(fonts), new THREE.Vector3(0.2, 0, 0))
        //createLetter("e", getRandomListElement(fonts), new THREE.Vector3(0.2, 0, 0))
        //createLetter("n", getRandomListElement(fonts), new THREE.Vector3(0.2, 0, 0))
        //createLetter("i", getRandomListElement(fonts), new THREE.Vector3(0.2, 0, 0))
        //createLetter("x", getRandomListElement(fonts), new THREE.Vector3(0.2, 0, 0))
    }

    opsTutorialStrings.push(createTextString("1. Ensure that microbit is \n plugged in and lights are on", 0.08, new THREE.Vector3(0.5,-0.5,0)))
    opsTutorialStrings.push(createTextString("2. Click connectWebUSB button -->", 0.08, new THREE.Vector3(0.58,0.77,0)))
    opsTutorialStrings.push(createTextString("<-- 3. Select BBC micro:bit \n and click connect", 0.08, new THREE.Vector3(-0.15,0.4,0)))
    opsTutorialStrings.push(createTextString("4. Place microbit on stand", 0.08, new THREE.Vector3(0,-0.4,0)))
    opsTutorialStrings.push(createTextString("Microbit disconnected. Connect USB \n cable and restablish connection -->", 0.08, new THREE.Vector3(0.58,0.77,0)))

    opsTutorialStrings[2].visible = false
    opsTutorialStrings[3].visible = false
    opsTutorialStrings[4].visible = false
}

function getRandomListElement(list){
    var item = list[rand(0,list.length-1)]
    return item
}

function getTextureByLetter(letter){
    letter = letter.toLowerCase()
    if(letter == "p") return getRandomListElement(p_textures)
    else if(letter == "h") return getRandomListElement(h_textures)
    else if(letter == "o") return getRandomListElement(o_textures)
    else if(letter == "e") return getRandomListElement(e_textures)
    else if(letter == "n") return getRandomListElement(n_textures)
    else if(letter == "i") return getRandomListElement(i_textures)
    else if(letter == "x") return getRandomListElement(x_textures)
    else return null
}

function getListByLetter(letter){
    letter = letter.toLowerCase()
    if(letter == "p") return p_textures
    else if(letter == "h") return h_textures
    else if(letter == "o") return o_textures
    else if(letter == "e") return e_textures
    else if(letter == "n") return n_textures
    else if(letter == "i") return i_textures
    else if(letter == "x") return x_textures
    else return null
}

var letterSpawnCount = 0
function createLetter(textString, font, position){

    const size = 0.35
    const textGeometry = new TextGeometry(
        textString,
        {
            font: font,
            size: size,
            height: 0.02,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.002,
            bevelOffset: 0,
            bevelSegments: 5
        }
    )
    textGeometry.computeBoundingBox()
    textGeometry.center()

    const mat = new THREE.MeshBasicMaterial( { color: getRandomListElement(colours) })
    
    const mesh = new THREE.Mesh(textGeometry, mat)
    mesh.name = textString + "_letter"
    mesh.position.x = xPositions[letterSpawnCount]
    letters.push(mesh)
    scene.add(mesh)

    var start = new THREE.Vector3()
    start.copy(mesh.position)
    mesh.userData = { letter: textString, startPos: start }
 
    letterSpawnCount++
    if(letterSpawnCount > xPositions.length) letterSpawnCount = 0
    
    const helper = new THREE.Box3Helper(textGeometry.boundingBox)
    //scene.add(helper)
    helper.name = textString + "_helper"

    const body = new CANNON.Body({
        mass: rand(1,5),
        angularFactor: new CANNON.Vec3(0,0,1),      //Restricts rotation on x and y axis
        linearFactor: new CANNON.Vec3( 1, 1, 0),     //Restricts movement on z axis 
        angularDamping: 0.7
    })
    body.addShape(
        new CANNON.Box( new CANNON.Vec3(size/4, size/2, size/2)) 
    )

    body.userData = { obj: mesh}
    body.allowSleep = true
    body.sleepSpeedLimit = 0.1      // body will feel sleepy if normalised velocity < 0.1
    body.sleepTimeLimit = 10        //body will sleep after 10 seconds
    body.addEventListener('sleep', function(event){
        sleepingBodies++
        console.log("num of sleeping bodies: " + sleepingBodies)
    })
    body.addEventListener('wakeup', function(event){
        sleepingBodies--
        console.log("num of sleeping bodies: " + sleepingBodies)
    })

    body.position.copy(mesh.position)
    world.addBody(body)
    objectsToUpdate.push({ mesh, body })

    //body.addEventListener('collide', edgeCollision)
}

function createTextString(text, size, position){
    const textGeo = new TextGeometry(
        text,
        {
            font: futuraFont,
            size: size,
            height: 0.02,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.002,
            bevelOffset: 0,
            bevelSegments: 5
        }
    )

    textGeo.computeBoundingBox()
    textGeo.center()

    const mesh = new THREE.Mesh(textGeo, mat)
    mesh.position.copy(position)
    scene.add(mesh)

    return mesh
}

createLetterPlane("p")
createLetterPlane("h")
createLetterPlane("o")
createLetterPlane("e")
createLetterPlane("n")
createLetterPlane("i")
createLetterPlane("x")

function createLetterPlane(letter){

    letter = letter.toLowerCase()
    let randStyle = rand(0, styleNum - 1)    // randomly chooses a style of letter - (0, 1, 2, 3)
    let tex = getListByLetter(letter)[randStyle]

    const geometry = new THREE.PlaneGeometry(1,1)
    geometry.computeBoundingBox()
    geometry.center()

    const material = new THREE.MeshBasicMaterial({ 
        map: tex, 
        transparent: true, 
        color: getRandomListElement(colours) 
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = letter + "_letter"
    letters.push(mesh)
    scene.add(mesh)
    
    mesh.position.x = xPositions[letterSpawnCount]
    letterSpawnCount++
    if(letterSpawnCount > xPositions.length) letterSpawnCount = 0

    if(letter == "p" || letter == "P"){
         mesh.scale.set(0.4, 0.4, 0.4)
         mesh.position.y += 0.05
    }
    else mesh.scale.set(0.3, 0.3, 0.3)
    
    var start = new THREE.Vector3()
    start.copy(mesh.position)
    mesh.userData = { letter: letter, style: randStyle, startPos: start } // for randomising texture and position at runtime  

    const body = new CANNON.Body({
        mass: rand(1,5),
        angularFactor: new CANNON.Vec3(0, 0, 1),      //Restricts rotation on x and y axis
        linearFactor: new CANNON.Vec3( 1, 1, 0),     //Restricts movement on z axis 
        angularDamping: 0.7
    })
    //body.addShape( new CANNON.Box(new CANNON.Vec3(0.1, 0.2, 0.1)))

    createHitbox(body, letter, randStyle)

    body.userData = { obj: mesh }
    body.allowSleep = true
    body.sleepSpeedLimit = 0.1      // body will feel sleepy if normalised velocity < 0.1
    body.sleepTimeLimit = 15        //body will sleep after 10 seconds
    body.addEventListener('sleep', function(event){
        sleepingBodies++
        console.log("num of sleeping bodies: " + sleepingBodies)
    })
    body.addEventListener('wakeup', function(event){
        sleepingBodies--
        console.log("num of sleeping bodies: " + sleepingBodies)
    })

    body.position.copy(mesh.position)
    world.addBody(body)
    objectsToUpdate.push({ mesh, body })
}

function createHitbox(body, letter, type){
    letter = letter.toLowerCase()
    if(letter == "p"){

        body.addShape( new CANNON.Box(new CANNON.Vec3(0.1, 0.2, 0.1)))

        switch(type){
            case 0:
                break;
            case 1:
                break;
            case 2:
                break;
        }
    }
    else{   // default rectangle shape
        body.addShape( new CANNON.Box(new CANNON.Vec3(0.1, 0.15, 0.1)))
    }
}

// function to create each letter, 
// create physics body in function body, switch(font){ add shapes based on font }.
// Most fonts will be similar enough to use the same shapes
// master function createLetter() that calls baby functions

var offset = 0  //offset the edges from the edge of the screen. positive value (0.2) = gap between screen edge and box edge

calculateScreenEdgePositon()
createStaticBox(new THREE.Vector3(0   , maxY - offset, 0), new THREE.Vector3(maxX*2 , 0.01    , 1), false)  // Top
createStaticBox(new THREE.Vector3(maxX - offset, 0   , 0), new THREE.Vector3(0.01    , maxY*2 , 1), true)   // Right
createStaticBox(new THREE.Vector3(0   , minY + offset, 0), new THREE.Vector3(maxX*2 , 0.01    , 1), false)  // Bottom
createStaticBox(new THREE.Vector3(minX + offset, 0   , 0), new THREE.Vector3(0.01    , maxY*2 , 1), true)   // Left

function calculateScreenEdgePositon(){
    // Create a vector for each corner of the screen
    var topLeft = new THREE.Vector3(-1, 1, 0);
    var topRight = new THREE.Vector3(1, 1, 0);
    var bottomLeft = new THREE.Vector3(-1, -1, 0);
    var bottomRight = new THREE.Vector3(1, -1, 0);

    // Create a raycaster object
    var raycaster = new THREE.Raycaster();

    // Use the raycaster to get the world position of each screen corner
    raycaster.setFromCamera(topLeft, activeCamera);
    var worldTopLeft = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldTopLeft);
    raycaster.setFromCamera(topRight, activeCamera);
    var worldTopRight = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldTopRight);
    raycaster.setFromCamera(bottomLeft, activeCamera);
    var worldBottomLeft = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldBottomLeft);
    raycaster.setFromCamera(bottomRight, activeCamera);
    var worldBottomRight = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldBottomRight);

    // Get the screen edges by taking the minimum and maximum values of the x and y coordinates
    minX = Math.min(worldTopLeft.x, worldTopRight.x, worldBottomLeft.x, worldBottomRight.x);
    maxX = Math.max(worldTopLeft.x, worldTopRight.x, worldBottomLeft.x, worldBottomRight.x);
    minY = Math.min(worldTopLeft.y, worldTopRight.y, worldBottomLeft.y, worldBottomRight.y);
    maxY = Math.max(worldTopLeft.y, worldTopRight.y, worldBottomLeft.y, worldBottomRight.y);

    // Log the screen edges
    //console.log("Min X:", minX, "  Max X:", maxX, "  Min Y:", minY, "  Max Y:", maxY);
}

function createStaticBox(position, size = {x:1, y:1, z:1}, vertical){
    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z)
    const boxMesh = new THREE.Mesh(boxGeo, mat)

    boxMesh.position.copy(position)
    boxMesh.name = "static_box"
    scene.add(boxMesh)

    const body = new CANNON.Body({
        mass: 0
    })
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)))
    body.position.copy(position)
    world.addBody(body)

    body.addEventListener('collide', edgeCollision)
}

function clamp(num, min, max) { return Math.min(Math.max(num, min), max) }

function edgeCollision(collision){

    let velocity = collision.contact.getImpactVelocityAlongNormal()
    let position = new THREE.Vector3(collision.contact.bi.position.x + collision.contact.ri.x, collision.contact.bi.position.y + collision.contact.ri.y, 0) // world position of impact
    let colour = getRandomListElement(colours)

    let intensity = clamp(velocity, 0, 2)
    intensity = normaliseInRange(intensity, 0, 2, 150, 255).toFixed(0)

    //console.log(position)
    let strip_pos = 0

    if(position.x > 0 && position.y < 0){   // bottom right 
        strip_pos = normaliseInRange(position.x, 0, maxX, 0, 17)
        console.log("bottom right")
    }
    else if(position.x.toFixed(1) == maxX.toFixed(1)){   // right
        strip_pos = normaliseInRange(position.y, minY, maxY, 17, 35)
        console.log("right")
    }
    else if(position.y.toFixed(1) == maxY.toFixed(1)){  // top
        strip_pos = normaliseInRange(position.x, maxX, minX, 35, 68)
        console.log("top")
    }
    else if(position.x.toFixed(1) == minX.toFixed(1)){  // left
        strip_pos = normaliseInRange(position.y, maxY, minY, 68, 86)
        console.log("left")
    }
    else if(position.x < 0 && position.y < 0){          // bottom left
        strip_pos = normaliseInRange(position.x, minX, 0, 86, 101)
        console.log("bottom left")
    }
    strip_pos = strip_pos.toFixed(0)
    //strip_pos = strip_pos + parameters.LEDOffset
    console.log("pos: "+ strip_pos)
    //if(strip_pos > 150) strip_pos = 150
    
    if(collision.contact.bi.userData != null){      // if it can get the collision object (sometimes it cant???), set the colour to the letter colour
        let collisionObj = collision.contact.bi.userData.obj
        colour = collisionObj.material.color
    }
    
    if(canSendColMessage) sendCollisionMessage(colour, strip_pos, intensity)
    canSendColMessage = false
    setTimeout(function(){canSendColMessage = true}, 700)      //set delay between sending collision messages so that multiple messages aren't sent for one collision

    if(parameters.collisionVisualisation){  // if true, spawn a sphere on collision points
        const geo = new THREE.SphereGeometry(velocity/15)
        const mesh = new THREE.Mesh(geo, new THREE.MeshNormalMaterial())
        mesh.position.set(position.x, position.y, 0)
        scene.add(mesh)
    }
}

function sendCollisionMessage(col, position, intensity){

    var r = Math.round(col.r * 255)
    var g = Math.round(col.g * 255)
    var b = Math.round(col.b * 255)

    var message = r + "," + g + "," + b + "," + position + "," + intensity + "#"
    var debugMessage = "r:" + r + ", g:" + g + ", b:" + b + ", pos:" + position + ", i:" + intensity + "#"

    if(connectedDevices.length > 0){        
        uBitSend(connectedDevices[0], message)
        //console.log("Sent collision message: '" + message+"'")
    }
    else{
        console.log("Failed to send message: " + debugMessage + ". No connected devices")
    }

}

function sendCumulativeMessage(){
    if(connectedDevices.length > 0){
        uBitSend(connectedDevices[0], "c;")
        console.log("Send cumulative mode toggle message")
    }
    else{
        console.log("Failed to send cumulative mode message. No connected devices")
    }
}

function earthquake(){
    var impulse = new THREE.Vector3()
    objectsToUpdate.forEach(element => {
        impulse = new THREE.Vector3(rand(-parameters.earthquakeForce, parameters.earthquakeForce), rand(-parameters.earthquakeForce, parameters.earthquakeForce), 0)
        element.body.applyImpulse( impulse, CANNON.Vec3.ZERO )
    });
}

// Update /////
const clock = new THREE.Clock()
let oldElapsedTime = 0

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - oldElapsedTime
    oldElapsedTime = elapsedTime

    if(fontLoadFlag){
        onFontsLoaded()
        fontLoadFlag = false
    }

    // Update physics
    world.step(1 / 60, deltaTime, 3)
    if(objectsToUpdate.length > 0){
        //console.log(objectsToUpdate)
    }
    for(const object of objectsToUpdate)
    {
        object.mesh.position.set(object.body.position.x, object.body.position.y, 0)
        object.mesh.quaternion.copy(object.body.quaternion)

        //var euler = new CANNON.Vec3()         # for sprite rotation
        //object.body.quaternion.toEuler(euler, 'YZX')
        //object.mesh.material.rotation = euler.z

        if(object.mesh.position.x > maxX || object.mesh.position.x < minX || object.mesh.position.y > maxY || object.mesh.position.y < minY){
            // check if any of the letters escape the bounds, reset all
            resetAll()
        }
    }

    if(sleepingBodies >= letters.length){       //check if all the letters are sleeping, then earthquake them
        console.log("all bodies sleeping")
        earthquake()
        //maybe add randomness here
    }

    if(mbConnectedFirstTime && connectedDevices == 0){
        console.log("Microbit disconnected.")
        deploymentGui.show()
        opsTutorialStrings[4].visible = true
    }

    if(parameters.cannonDebugEnabled) cannonDebugger.update()

    // Render
    renderer.render(scene, activeCamera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()

function rand(min, max){    // inclusive
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function deviceConnected(){
    opsTutorialStrings[2].visible = false
    opsTutorialStrings[3].visible = true

    setTimeout(function(){
        opsTutorialStrings[3].visible = false
        parameters.earthquakeForce = 2
        parameters.MBGravity = true
        parameters.mouseGravity = false
        deploymentGui.hide()
    }, 20000)
}

function updateCamType(){

    if(useOrtho){    // true == use orthographic camera
        activeCamera = orthoCamera
    }
    else{               // Use perspective camera with orbit controls
        activeCamera = perspectiveCamera
    }
}

function resetAll(){
    resetLetterPosition()
    randomiseAllTextures()
   // randomiseAllFonts()
   // randomiseAllColours()
}

function resetLetterPosition(){
    // reset the position of each body, as well as velocity, angle, and angular velocity
    for(var i = 0; i < letters.length ; i++){
        var pos = objectsToUpdate[i].mesh.userData.startPos
        objectsToUpdate[i].body.position.set(pos.x, pos.y, pos.z)
        objectsToUpdate[i].body.velocity.set(0,0,0)
        objectsToUpdate[i].body.quaternion.setFromEuler(0,0,0, 'XYZ')
        objectsToUpdate[i].body.angularVelocity.set(0,0,0)
    }
}

function randomiseAllTextures(){
    letters.forEach(element =>{
        element.material.map = getTextureByLetter(element.userData.letter)
        element.material.color = getRandomListElement(colours)
    })
}

function setAllStyles(i){       // Set all the letters to a certain style
    letters.forEach(element => {
        element.material.map = getListByLetter(element.userData.letter)[i]
    });
}

function setAllColours(colour){
    letters.forEach(element => {
        element.material.color = colour
    });
}

function randomiseAllFonts(){
    letters.forEach(element => {

        let newGeo = new TextGeometry(
            element.userData.letter,
            {
                font: getRandomListElement(fonts),
                size: 0.35,
                height: 0.02,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.001,
                bevelSize: 0.002,
                bevelOffset: 0,
                bevelSegments: 5
            }
        )
        newGeo.computeBoundingBox()
        newGeo.center()
        
        element.geometry.dispose()
        element.geometry = newGeo
    });
}

function randomiseAllColours(){
    letters.forEach(element => {
        let newMat = new THREE.MeshBasicMaterial( { color: getRandomListElement(colours) })

        element.material.dispose()
        element.material = newMat
    });
}

function setGravity(x, y){
    world.gravity.set(x,y,0)
    //console.log("Gravity set to x: " + x + "  y: " + y)
}

// Events /////
window.addEventListener('keydown', function(event) {
    console.log(event.key.charCodeAt(0))
    if(event.key.charCodeAt(0) >= 97 && event.key.charCodeAt(0) <= 122){    //If input is a letter a-z (lower case)
        //createLetter(event.key, randomFont(), new THREE.Vector3(0,0,0))
    }
    else if(event.key.charCodeAt(0) >= 65 && event.key.charCodeAt(0) <= 90){    //If input is A-Z (Upper case)
        //createLetter(event.key, randomFont(), new THREE.Vector3(0,0,0))
    }
    if(parameters.typeInput) createLetter(event.key, getRandomListElement(fonts), new THREE.Vector3(0,0,0))    //if type input is enabled, create letter with the input

    if(event.key.charCodeAt(0) >= 48 && event.key.charCodeAt(0) <= 57){     // if input is a number key, send it to microbit with delimiter
        //console.log("Sending keycode: " + event.key + "|")
        //uBitSend(connectedDevices[0], event.key + "|")
        setAllStyles(event.key)
    }

    if(event.key.charCodeAt(0) == 32){      // space bar        
        sendCollisionMessage(new THREE.Color(Math.random(), Math.random(), Math.random()), (Math.random() * 150).toFixed(0), 255)
    }
})

window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX / sizes.width * 2 - 1
    mouse.y = - (event.clientY / sizes.height) * 2 + 1

    if(parameters.mouseGravity) setGravity(mouse.x * parameters.gravityLimit, mouse.y * parameters.gravityLimit)
})

window.addEventListener('click', (event) => {
    //console.log("Click")
    //resetAll()
})

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    
    // Update camera
    activeCamera.aspect = sizes.width / sizes.height
    activeCamera.updateProjectionMatrix()
    
    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    calculateScreenEdgePositon()
})

///////// Microbit stuff /////////

async function clickConnectWebUSB(){
    console.log("connect")
    uBitConnectDevice(uBitEventHandler)
    
    opsTutorialStrings[0].visible = false
    opsTutorialStrings[1].visible = false
    opsTutorialStrings[2].visible = true
}

async function clickSendWebUSB(){
    if(connectedDevices.length > 0){
        //uBitSend(connectedDevices[0], "toggle_send|")
    }
    else{
        console.log("No WebUSB devices connected")
    }
}

var lastGravX, lastGravY
var gravX = 0
var gravY = 0

async function parseMBData(packet){
    var data = packet.data
    var id = packet.graph

    //console.log("Received data: " + data + "  on graph: " + id) 

    switch(id){
        case "x":
            // pitch (x axis, -180 to 180)
            if(data != null) gravY = normaliseInRange(data, -180, 180, -parameters.gravityLimit, parameters.gravityLimit)
            else gravY = lastGravY

            break
        case "y":
            // roll (y axis, -180 to 180)
            if(data != null) gravX = normaliseInRange(data, -180, 180, -parameters.gravityLimit, parameters.gravityLimit)
            else gravX = lastGravX

            break
        case "z":
            // compass heading (0 to 360)
            break
        case "s":
            // shake
            resetAll()

            break
        case "a":
            // a button pressed
            earthquake()
            break
        case "b":
            // b button pressed
            setAllStyles(data)
            break
        case "c":
            // c button pressed

            break
    }

    if(parameters.MBGravity){
        console.log("setting gravity to x: " + gravX.toFixed(2), "  y: " + gravY.toFixed(2))
        setGravity(gravX, -gravY)
    }    
    lastGravX = gravX
    lastGravY = gravY
}

var connectedDevices = []

function uBitEventHandler(reason, device, data){
    //console.log(reason, data)
    switch(reason){
        case "connected":
            console.log("USB device connected")
            connectedDevices.push(device)
            break
        case "disconnected":
            console.log("USB device disconnected")
            connectedDevices = connectedDevices.filter( v => v != device)
            break
        case "connection failure":
            console.log("USB device connection failure")
            break
        case "error":
            console.log("USB device error")
            break
        case "console":
            console.log("USB device Console Data: " + data.data)
            break
        case "graph-event":
            //console.log(`USB device Graph Event:  ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            break
        case "graph-data":
            //console.log(`USB Device Graph Data: ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            parseMBData(data)
            break
    }
}

function normaliseInRange(val, oldMin, oldMax, newMin, newMax){
    return newMin + (val - oldMin) * (newMax - newMin) / (oldMax - oldMin)
}

/////////////////UBIT///////////////////


/*
 * JavaScript functions for interacting with micro:bit microcontrollers over WebUSB
 * (Only works in Chrome browsers;  Pages must be either HTTPS or local)
 */


const MICROBIT_VENDOR_ID = 0x0d28
const MICROBIT_PRODUCT_ID = 0x0204

/*
   Open and configure a selected device and then start the read-loop
 */
async function uBitOpenDevice(device, callback) {
    const transport = new WebUSB(device)
    const target = new DAPLink(transport)
    let buffer=""                               // Buffer of accumulated messages
    const parser = /([^.:]*)\.*([^:]+|):(.*)/   // Parser to identify time-series format (graph:info or graph.series:info)
        
    target.on(DAPLink.EVENT_SERIAL_DATA, data => {
        buffer += data;
        let firstNewline = buffer.indexOf("\n")
        while(firstNewline>=0) {
            let messageToNewline = buffer.slice(0,firstNewline)
            let now = new Date() 
            // Deal with line
            // If it's a graph/series format, break it into parts
            let parseResult = parser.exec(messageToNewline)
            if(parseResult) {
                let graph = parseResult[1]
                let series = parseResult[2]
                let data = parseResult[3]
                let callbackType = "graph-event"
                // If data is numeric, it's a data message and should be sent as numbers
                if(!isNaN(data)) {
                    callbackType = "graph-data"
                    data = parseFloat(data)
                }
                // Build and send the bundle
                let dataBundle = {
                    time: now,
                    graph: graph, 
                    series: series, 
                    data: data
                }
                callback(callbackType, device, dataBundle)
            } else {
                // Not a graph format.  Send it as a console bundle
                let dataBundle = {time: now, data: messageToNewline}
                callback("console", device, dataBundle)
            }
            buffer = buffer.slice(firstNewline+1)  // Advance to after newline
            firstNewline = buffer.indexOf("\n")    // See if there's more data
        }
    });
    await target.connect();
    await target.setSerialBaudrate(115200)
    //await target.disconnect();
    device.target = target;   // Store the target in the device object (needed for write)
    device.callback = callback // Store the callback for the device
    callback("connected", device, null)    
    target.startSerialRead()
    deviceConnected()
    mbConnectedFirstTime = true             // flag for the MB being connected for the first time
    opsTutorialStrings[4].visible = false   //remove warning message for when MB gets disconnected
    return Promise.resolve()
}


/**
 * Disconnect from a device 
 * @param {USBDevice} device to disconnect from 
 */
async function uBitDisconnect(device) {
    if(device) {
        try {
            await device.target.stopSerialRead()
        } catch(error) {
            // Failure may mean already stopped
        }
        try {
            await device.target.disconnect()
        } catch(error) {
            // Failure may mean already disconnected
        }
        try {
            await device.close()
        } catch(error) {
            // Failure may mean already closed
        }
        // Call the callback with notification of disconnect
        device.callback("disconnected", device, null)
        device.callback = null
        device.target = null
    }
}

/**
 * Send a string to a specific device
 * @param {USBDevice} device 
 * @param {string} data to send (must not include newlines)
 */
function uBitSend(device, data) {
    if(!device.opened)
        return
    let fullLine = data+'\n'
    device.target.serialWrite(fullLine)
}


/**
 * Callback for micro:bit events
 * 
 
   Event data varies based on the event string:
  <ul>
   <li>"connection failure": null</li>
   <li>"connected": null</li>
   <li>"disconnected": null</li>
   <li>"error": error object</li>
   <li>"console":  { "time":Date object "data":string}</li>
   <li>"graph-data": { "time":Date object "graph":string "series":string "data":number}</li>
   <li>"graph-event": { "time":Date object "graph":string "series":string "data":string}</li>
  </ul>

 * @callback uBitEventCallback
 * @param {string} event ("connection failure", "connected", "disconnected", "error", "console", "graph-data", "graph-event" )
 * @param {USBDevice} device triggering the callback
 * @param {*} data (event-specific data object). See list above for variants
 * 
 */


/**
 * Allow users to select a device to connect to.
 * 
 * @param {uBitEventCallback} callback function for device events
 */
function uBitConnectDevice(callback) { 
    navigator.usb.requestDevice({filters: [{ vendorId: MICROBIT_VENDOR_ID, productId: MICROBIT_PRODUCT_ID }]})
        .then(  d => { if(!d.opened) uBitOpenDevice(d, callback)} )
        .catch( () => callback("connection failure", null, null))
    
}

//stackoverflow.com/questions/5892845/how-to-load-one-javascript-file-from-another
var newScript = document.createElement('script');
newScript.type = 'text/javascript';
newScript.src = 'dap.umd.js';
document.getElementsByTagName('head')[0].appendChild(newScript);

navigator.usb.addEventListener('disconnect', (event) => {
    if("device" in event && "callback" in event.device && event.device.callback!=null && event.device.productName.includes("micro:bit")) {
        uBitDisconnect(event.device)
    }
 })
