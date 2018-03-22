var createText = require('three-bmfont-text')
var loadFont = require('load-bmfont')
var colors = require('./colors.json')
var MSDFShader = require('three-bmfont-text/shaders/msdf')



AFRAME.registerComponent('dataplot', {
    schema: {
        // Data source (File)
        src: { type: 'asset', default: 'none' },

        // Data source (Raw array and objects)
        raw: { default: 'none', parse: function(data) { return data } },

        // Title
        title: { type: 'string' },

        // X, Y, Z dimension key
        x: { type: 'string' },
        y: { type: 'string' },
        z: { type: 'string' },

        // Point size depends on which axis
        s: { type: 'string' },

        // Color depends on which axis
        val: { type: 'string' },

        // Color preset template
        colorpreset: { default: 'jet', type: 'string' },

        // If available, color preset will be overriden
        pointcolor: { default: '', type: 'string' },

        // Values to be filtered
        valfil: { default: [], type: 'array' },
        xfil: { default: [], type: 'array' },
        yfil: { default: [], type: 'array' },
        zfil: { default: [], type: 'array' },
        sfil: { default: [], type: 'array' },

        // Relative limit of X, Y, Z dimension
        xlimit: { type: 'number', default: 1 },
        ylimit: { type: 'number', default: 1 },
        zlimit: { type: 'number', default: 1 },

        // Dimensions that share same units
        relationship: { default: 'none', type: 'string' },

        // Sprite for the point, default changed to none
        pointsprite: { default: null, type: 'string' },

        // Invert X, Y, Z shape
        xflip: { type: 'boolean' },
        yflip: { type: 'boolean' },
        zflip: { type: 'boolean' },

        // Label for X, Y, Z axis
        xlabel: { type: 'string', default: '' },
        ylabel: { type: 'string', default: '' },
        zlabel: { type: 'string', default: '' },

        // Turn of rendering
        nochrome: { type: 'boolean', default: false },

        // Axes tick marks visibility
        showTicks: { type: 'boolean', default: true },

        // Axes labels marks visibility
        showTickLabels: { type: 'boolean', default: true },

        // Axes legend visibility
        showcolorbar: { type: 'boolean', default: true },

        // Frame around plot
        cage: { type: 'boolean', default: false },

        // Number of decimal places
        numdecimalplaces: { type: 'number', default: 4 },

        // Floor on the graph visibility
        showFloor: { type: 'boolean', default: false },

        // Floor material on the graph
        floorMaterialParams: { type: 'string', default: 'color: #fff; opacity: 0.5; transparent: true;' },

        // Size of points
        pointsize: { type: 'number', default: 1 },

        // Show value on hover
        showValueOnHover: { type: 'boolean', default: false }
    },

    // TODO: (Ang) Improve on update
    update: function(oldData) {
        var data = this.data;
        var el   = this.el;

        
        if (data.raw !== "none") {
            if (data.raw !== oldData.raw) {
                renderGeometryFromRaw(el, data);
            }
        } else if (data.src !== "none") {
            if (data.src !== oldData.src) {
                // TODO: This logic is not quite right. If the user actually specifies anything, even the default option, we should set this flag to True. But I dont know how to test whether the value was filled in using the schema default (i.e. the user specified it) or whether the value was provided by the user but coincidientally is the same as the schema default.
                data.userSpecifiedPointsprite = (data.pointsprite != this.__proto__.schema.pointsprite.default);
                renderGeometryAndKeyFromPath(el, data);
            }
        } else {
            console.log("No input data available")
        }
    }
});



var customVertexShader =  [ 
    'attribute float size;',
    'attribute vec3 customColor;',
    'varying vec3 vColor;',
    'void main() {',
    '    vColor = customColor;',
    '    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
    '    gl_PointSize = size * ( 300.0 / -mvPosition.z );',
    '    gl_Position = projectionMatrix * mvPosition;',
    '}'
].join('\n');

var customFragShader = [
    'uniform vec3 color;',
    'uniform sampler2D texture;',
    'varying vec3 vColor;',
    'void main() {',
    '    gl_FragColor = vec4( color * vColor, 1.0 );',
    '    gl_FragColor = gl_FragColor * texture2D( texture, gl_PointCoord );',
    '    if ( gl_FragColor.a < 0.6 ) discard;',
    '}'
].join('\n');





// Show value of points on hover
function setupHighlight(el, particleSystem) {
    var scene = el.sceneEl;
    var mouse = new THREE.Vector2();
    var camera = scene.camera;

    // Prepare canvas
    var textCanvas = document.createElement("canvas");
    textCanvas.width = 1024;
    textCanvas.height = 512;
    var textContext = textCanvas.getContext("2d");
    textContext.textAlign = "center";

    function makeTextSprite(text, relPosition, absPosition) {
        var padding = 5;
        textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);

        // Fit text using binary search
        var lo = 0, mid, hi = 128;
        while (hi - lo > 0.5) {
            mid = (lo + hi) / 2;
            textContext.font = mid + "px Roboto";

            var width = textContext.measureText(text).width;
            if (width > textCanvas.width - (padding * 2)) {
                hi = mid;
            } else {
                lo = mid;
            }
        }

        // Draw canvas
        textContext.font = lo + "px Roboto";
        var width  = textContext.measureText(text).width;
        var height = lo;
        var yOffset = 64;

        textContext.fillStyle = "white";
        textContext.fillRect(0, yOffset, textCanvas.width, height * 1.414);

        textContext.fillStyle = "black";
        textContext.lineWidth = 5;
        textContext.strokeRect(0, yOffset, textCanvas.width, height * 1.414);
        textContext.fillText(text, textCanvas.width / 2, yOffset + height);

        // Texture using canvas
        var texture = new THREE.Texture(textCanvas);
        texture.needsUpdate = true;

        // Make it on top of everything
        var spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        spriteMaterial.depthWrite = false;
        spriteMaterial.depthTest = false;

        var sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(relPosition.x, relPosition.y, relPosition.z);
        sprite.renderDepth = 1e20;

        // Dynamic scale
        var scale = absPosition.distanceTo(camera.getWorldPosition()) * (window.innerWidth / textCanvas.width);
        sprite.scale.set(scale, scale / (textCanvas.width / textCanvas.height));

        return sprite;
    }

    // Prepare highlight
    var highlightedColor = new THREE.Color(0x000000);
    var highlightedPoints = [];
    var originalColor = {};

    function render() {
        // Use RayCaster to find the intersection
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        raycaster.params.Points.threshold = 0.05;
        var intersects = raycaster.intersectObject(particleSystem, false);

        highlightedPoints.forEach(function(i) {
            var color = particleSystem.geometry.colors[i];
            color.copy(originalColor[i]);
        });
        highlightedPoints = [];

        if (intersects.length > 0) {
            var minValue = Infinity;
            var highlighted;

            // Find the nearest point to ray
            intersects.forEach(function(i) {
                if (i.distanceToRay < minValue) {
                    minValue = i.distanceToRay;
                    highlighted = i;
                }
            });

            // Highlight the point
            var color = particleSystem.geometry.colors[highlighted.index];
            originalColor[highlighted.index] = color.clone();
            color.copy(highlightedColor.clone);
            highlightedPoints.push(highlighted.index);

            // Show the coordinate
            var position = particleSystem.geometry.vertices[highlighted.index];
            var textString = "(" + position.x.toFixed(4) + ", " + position.y.toFixed(4) + ", " + position.z.toFixed(4) + ")";
            var textSprite = makeTextSprite(textString, position, highlighted.point);
            el.setObject3D("point-position", textSprite);
        } else {
            if (el.getObject3D("point-position") !== undefined) {
                el.removeObject3D("point-position");
            }
        }

        particleSystem.geometry.colorsNeedUpdate = true;
        requestAnimationFrame(render);
    }

    render();

    // Allow mouse hovering
    window.addEventListener("mousemove", function(e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }, false);

    function recompute() {
        mouse.x = 0;
        mouse.y = 0;
    }

    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
}



function renderGeometryAndKeyFromPath(el, data) {
    
    d3.json(data.src, function(json) {
        var colorPreset = "colors." + data.colorpreset

        var filterMap = {};

        ["val", "x", "y", "z"].forEach(function(k) {
            filterMap[k] = {};

            var filterArray = splitAndParse(data[k + "fil"]);
            filterArray.forEach(function(val) {
                filterMap[k][val] = true;
            });
        });

        function splitAndParse(dat) {
            // Split if not array
            if (!Array.isArray(dat)) {
                dat = dat.split(",");
            }

            return dat.map(function(part) {
                return parseFloat(part.trim(), 10);
            });
        }

        json = json.filter(function(point) {
            return !(["val", "x", "y", "z"].some(function(k) {
                return (filterMap[k][point[data[k]]]);
            }));
        });
        
        // Figure out value ranges for the axes
        var stats = getDataStats(json, data, colorPreset);

        if (data.xflip) {
            stats.scaleX.range([stats.width, 0]);
        } else {
            stats.scaleX.range([0, stats.width]);
        }

        if (data.yflip) {
            stats.scaleY.range([stats.height, 0]);
        } else {
            stats.scaleY.range([0, stats.height]);
        }

        if (data.zflip) {
            stats.scaleZ.range([stats.depth, 0]);
        } else {
            stats.scaleZ.range([0, stats.depth]);
        }

        var material;
        var geometry;
        
        // If point sizes are specified we have to use a THREE.BufferGeometry + ShaderMaterial.
        // If point sizes are not specified we can simply use THREE.Geometry + PointsMaterial. This supports per-point coloring but not per-point sizes. May be faster?
        if (data.s || data.userSpecifiedPointsprite) {
            // Point sizes are specified, we we must use BufferGeometry
                
                
            var uniforms = {
                color:     { value: new THREE.Color( 0xffffff ) },
                texture:   { value: new THREE.TextureLoader().load( data.pointsprite, function(){}, function(){}, function(){console.warn('Failed to load point sprite' + data.pointsprite)} ) }
            };

            material = new THREE.ShaderMaterial( {
                uniforms:       uniforms,
                vertexShader:   customVertexShader,
                fragmentShader: customFragShader,
                blending:       THREE.NormalBlending,
                //depthTest:      false, /* This */
                transparent:    true
            });

            
            //var mmaterial = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
            
            geometry = new THREE.BufferGeometry();
            var positions = new Float32Array( json.length * 3 );
            var colors = new Float32Array( json.length * 3 );
            var sizes = new Float32Array( json.length );

            var color = new THREE.Color();

            for ( var i = 0, i3 = 0; i < json.length; i ++, i3 += 3 ) {
                
                positions[ i3 + 0 ] = stats.scaleX(json[i][data.x]);
                positions[ i3 + 1 ] = stats.scaleY(json[i][data.y]);
                positions[ i3 + 2 ] = stats.scaleZ(json[i][data.z]);
        
                var c = stats.colorScale(json[i][data.val]); // Returns string like 'rgb(10,0,0)'
                
                if (data.pointcolor) 
                    var color = new THREE.Color(data.pointcolor)
                else
                    var color = new THREE.Color(c)
            

                colors[ i3 + 0 ] = color.r;
                colors[ i3 + 1 ] = color.g;
                colors[ i3 + 2 ] = color.b;
                
                sizes[ i ] = data.s ? (0.1 + data.pointsize * stats.scaleS(json[i][data.s])) : data.pointsize;

            }
            geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
            geometry.addAttribute( 'customColor', new THREE.BufferAttribute( colors, 3 ) );
            geometry.addAttribute( 'size', new THREE.BufferAttribute( sizes, 1 ) );

        } else { // Point sizes are not specified, so we can use a normal Geometry and Points Material
            geometry = new THREE.Geometry()
            json.forEach(function(point){
                var vertex = new THREE.Vector3()
                vertex.x = stats.scaleX(point[data.x])
                vertex.y = stats.scaleY(point[data.y])
                vertex.z = stats.scaleZ(point[data.z])
                geometry.vertices.push( vertex )
                var c = data.pointcolor ?  data.pointcolor : stats.colorScale(point[data.val])
                geometry.colors.push(new THREE.Color(c))
            })
            
            material = new THREE.PointsMaterial({
                size: data.pointsize * 0.006,
                vertexColors: THREE.VertexColors
            })
        } // Did we build a BufferGeometry or normal Geometry?


        // Create the particle system and add it to the scene
        var particleSystem = new THREE.Points(geometry, material);
        
        el.setObject3D('particles', particleSystem); // Can set 'particles' or 'mesh', not sure which is better...
        setupHighlight(el, particleSystem);
        
        // Add axes, tics, and title? 
        if (!data.nochrome) makeAxisAndKey(el, data, stats)

    })  // End the d3.json() parse of the .json source data.


}

function makeAxisAndKey(el, data, stats) {

    var lineDim = []
    var xDim = {}
        yDim = {}
        zDim = {}
    lineDim.push(xDim, yDim, zDim)

    xDim.v = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(stats.width, 0, 0)]
    yDim.v = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, stats.height, 0)]
    zDim.v = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, stats.depth)]

    lineDim.forEach(function(dim, i){
        makeLine(el, dim.v, i, 'baseLine')
        
        if (i==1 && data.cage) {
            // Add top edge (along Z axis)
            makeLine(el, [new THREE.Vector3(stats.width, 0, 0), new THREE.Vector3(stats.width, 0, stats.depth)], i,'edge_top'); 
            // Add righthand edge (along X axis)
            makeLine(el, [new THREE.Vector3(0, 0, stats.depth), new THREE.Vector3(stats.width, 0, stats.depth)], i,'edge_righthand'); 
            // Add three vertical lines to form a data cage
            makeLine(el, [new THREE.Vector3(stats.width, 0, 0), new THREE.Vector3(stats.width, stats.height, 0)], i,'extraBaseLine1'); // top of X axis (upper left)
            makeLine(el, [new THREE.Vector3(stats.width, 0, stats.depth), new THREE.Vector3(stats.width, stats.height, stats.depth)], i,'extraBaseLine2'); // Upper righthand corner
            makeLine(el, [new THREE.Vector3(0, 0, stats.depth), new THREE.Vector3(0, stats.height, stats.depth)], i,'extraBaseLine3'); // end of Z axis (lower right)
        }
        
        var textHeight = 0.05
        if (i == 0 && data.showTicks ) {
            var marks = Math.round(stats.width/textHeight)
            if (marks == 1) {
                marks++;
            }
            makeAxisTicks(i, dim.v, el, marks, stats.minX, stats.maxX, data.numdecimalplaces, data.showTickLabels)
        } else if (i == 1 && data.showTicks) {
            var marks = Math.round(stats.height/textHeight)
            if (marks == 1) {
                marks++;
            }
            makeAxisTicks(i, dim.v, el, marks, stats.minY, stats.maxY, data.numdecimalplaces, data.showTickLabels)
        } else if (i == 2 && data.showTicks) {
            var marks = Math.round(stats.depth/textHeight)
            if (marks == 1) {
                marks++;
            }
            makeAxisTicks(i, dim.v, el, marks, stats.minZ, stats.maxZ, data.numdecimalplaces, data.showTickLabels)
        }

    })

    var colorPreset = "colors." + data.colorpreset
    if (data.showcolorbar) createColorKey(el, stats, colorPreset, data.numdecimalplaces)
    createAxisLabels(el, data, stats)

    if (data.showFloor) {
        var floorNode = document.createElement("a-entity");
        floorNode.setAttribute('geometry',{"primitive":"plane", "width":stats.width, "height":stats.depth});
        // Small shift down the Y axis so that in case the floor is not transparent (to save GPU) it will not interfere with point sprites.
        floorNode.setAttribute('position',[stats.width/2, -0.01, stats.depth/2].join(" "));
        floorNode.setAttribute('rotation','-90 0 0');
        floorNode.setAttribute('material',AFRAME.utils.styleParser.parse(data.floorMaterialParams));
        el.appendChild(floorNode);
    }
    


}


function createAxisLabels(el, data, stats) {
    var pos = new THREE.Vector3(stats.width + 0.05,0,stats.depth)
    var objName = "title"
    var textString = data.title
    var align = "center"
    var rot = {x: THREE.Math.degToRad(90), y: THREE.Math.degToRad(0), z: THREE.Math.degToRad(-90)}
    addText(el, pos, objName, textString, align, rot)


    //                                Ydim   Height  Xdim
    var xlabpos = new THREE.Vector3(stats.width/2, 0 , -0.13) 
    var ylabpos = new THREE.Vector3(-0.01, stats.height/3 , -0.025) // Lower left corner, 1/3rd above the bottom
    var zlabpos = new THREE.Vector3(-0.14, 0 ,stats.depth)
    if (data.xlabel) addText(el, xlabpos, "xlabel", data.xlabel, "right", rot)
    if (data.ylabel) addText(el, ylabpos, "ylabel", data.ylabel, "right", rot)
    if (data.zlabel) addText(el, zlabpos, "zlabel", data.zlabel, "center", rot) // correct
    
}

function makeAxisTicks(i, dimStartAndEndVectors, el, marks, min, max, numdecimalplaces, showTickLabels) {
    var axisStats = []
    var d = []

    for (m = 0; m < marks; m++) {
        var val = m / (marks - 1)
        d.push(val)
    }

    d.forEach(function(v) {
        var vScale = d3.scaleLinear().domain([0, 1]).range([min, max])
        axisStats.push(vScale(v).toFixed(numdecimalplaces)) 
    })
    makeTicks(el, d, dimStartAndEndVectors, i, axisStats, showTickLabels)
}

function makeTicks(el, tickVals, dimStartAndEndVectors, dimensionID, axisStats, showTickLabels) {
    tickVals.forEach(function(perc, j) {
        var v1 = getPointInBetweenByPerc(dimStartAndEndVectors[0], dimStartAndEndVectors[1], perc)
        var v2;
        var v2Text;
        var objName = "" + dimensionID + "" + j
        var textString = ""
        if (dimensionID == 0) {
            v2 = new THREE.Vector3(v1.x, v1.y, v1.z - 0.03)
            v2Text = new THREE.Vector3(v1.x - 0.01, v1.y, v1.z - 0.04)
            var rot = {x: THREE.Math.degToRad(90), y: THREE.Math.degToRad(0), z: THREE.Math.degToRad(-90)};
            textString += axisStats[j];
        } else if (dimensionID == 1) {
            v2 = new THREE.Vector3(v1.x - 0.03, v1.y, v1.z - 0.03)
            v2Text = new THREE.Vector3(v1.x - 0.75, v1.y, v1.z + 0.25)
            var rot = {x: THREE.Math.degToRad(90), y: THREE.Math.degToRad(0), z: THREE.Math.degToRad(225)};
            textString += axisStats[j];
        } else if (dimensionID == 2) {
            v2 = new THREE.Vector3(v1.x - 0.03, v1.y, v1.z)
            v2Text = new THREE.Vector3(v1.x - 1.035, v1.y, v1.z + 1.01)
            var rot = {x: THREE.Math.degToRad(90), y: THREE.Math.degToRad(0), z: THREE.Math.degToRad(-180)};
            textString += axisStats[j];
        }

        var nV = [v1, v2]
        makeLine(el, nV, objName, 'xLine')
        if (showTickLabels) { addText(el, v2Text, objName, textString, 'right', rot) }
    
    })

}

function addText(el, pos, objName, textString, align, rot) {

    fontLoader({
      font: 'https://cdn.aframe.io/fonts/Roboto-msdf.json',
      image: 'https://cdn.aframe.io/fonts/Roboto-msdf.png'
    }, start)

    function start(font, texture) {
      texture.needsUpdate = true
      texture.anisotropy = 16

      var options = {
        font: font,
        text: textString,
        width: 1000,
        align: align,
        letterSpacing: 0,
        lineHeight: 38,
        mode: 'normal'
      }

      var geometry = createText(options)

      var material = new THREE.RawShaderMaterial(MSDFShader({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        color: el.getAttribute("textColor")? el.getAttribute("textColor") : '#000', /* Default is black */
        opacity: 1.0
      }))

      var text = new THREE.Mesh(geometry, material)
      
      text.scale.multiplyScalar(-0.001)
      text.rotation.set(rot.x, rot.y, rot.z)
      text.position.set(pos.x, pos.y, pos.z - 1.0)

      el.setObject3D('bmfont-text' + objName, text)
    }
}

function fontLoader(opt, cb) {
  loadFont(opt.font, function (err, font) {
    if (err) {
      throw err
    }

    var textureLoader = new THREE.TextureLoader()
    textureLoader.load(opt.image, function (texture) {
      cb(font, texture)
    })
  })
}

function createColorKey(el, stats, colorPreset, numdecimalplaces) {

    var axisStatsVal = [stats.minVal, (stats.minVal + ((stats.maxVal + stats.minVal) * 0.5))/2, (stats.minVal + stats.maxVal)  * 0.5, (stats.maxVal + ((stats.maxVal + stats.minVal) * 0.5))/2, stats.maxVal]
    var v1, v2;

    var geometry = new THREE.CubeGeometry( 0.075, 0.001, 0.4)

    var texture = new THREE.Texture( generateTexture(colorPreset) )
    texture.needsUpdate = true

    var material = new THREE.MeshBasicMaterial( { map: texture, transparent: true } )
    
    mesh = new THREE.Mesh( geometry, material )

    mesh.position.set(stats.width * 0.5, 0, stats.depth + 0.1)
    mesh.rotateY(THREE.Math.degToRad(90))

    v1 = new THREE.Vector3((stats.width * 0.5) - 0.2, 0, stats.depth + 0.1375)
    v2 = new THREE.Vector3((stats.width * 0.5) + 0.2, 0, stats.depth + 0.1375)

    var d = [0, 0.25, 0.5, 0.75, 1]

    d.forEach(function(dVal, i){
        var v1Tick = getPointInBetweenByPerc(v1, v2, dVal)
        var v2Tick = new THREE.Vector3(v1Tick.x, v1Tick.y, v1Tick.z + 0.03)
        var labelV = new THREE.Vector3(v1Tick.x - 0.01, v1Tick.y, v1Tick.z + 1.04)
        var rot = {x: THREE.Math.degToRad(90), y: THREE.Math.degToRad(0), z: THREE.Math.degToRad(-90)}
        makeLine(el,[v1Tick,v2Tick], i, "colorKeyBaseLine")
        addText(el, labelV, "colorKeyLabel" + i, "" + axisStatsVal[i].toFixed(numdecimalplaces), 'left', rot)
    })

    el.setObject3D('colorcube', mesh)

}

/* Builds the color bar */
function generateTexture(colorPreset) {
    var size = 512;

    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    var colorPresetPath = eval(colorPreset)

    var context = canvas.getContext('2d');

    context.rect(0, 0, size, size);
    var gradient = context.createLinearGradient(0, 0, 0, size);

    colorPresetPath.forEach(function(c, i){
        var step = i / 256;
        gradient.addColorStop(step, c);
    });
    
    context.fillStyle = gradient;
    context.fill();

    return canvas;
}

function getPointInBetweenByPerc(pointA, pointB, percentage) {

    var dir = pointB.clone().sub(pointA)
    var len = dir.length()
    dir = dir.normalize().multiplyScalar(len*percentage)
    return pointA.clone().add(dir)

}

function makeLine(el, v, i, objName) {
    
    //var c = el.getAttribute("textColor")?  parseInt(el.getAttribute("textColor").replace(/^#/,''),16) : 0x000000, /* Default is black */
    var c = el.getAttribute("textColor")?  el.getAttribute("textColor") : 0x000; /* Default is black */

    var material = new THREE.LineBasicMaterial({
        color: c,
        opacity: 0.45, 
        transparent: true, 
        depthWrite: false
    })

    var geometry = new THREE.Geometry()
    geometry.vertices = v

    var line = new THREE.Line( geometry, material )
    el.setObject3D(objName + i, line)
}


function renderGeometryFromRaw(el, data) {
    /* NOTE! This does not support the new per-point sizes, ie. does not use BufferGeometry */
    var json = JSON.parse(data.raw)
    var colorPreset = "colors." + data.colorpreset
    var geometry = new THREE.Geometry();

    var filterMap = {};

    ["val", "x", "y", "z"].forEach(function(k) {
        filterMap[k] = {};

        var filterArray = splitAndParse(data[k + "fil"]);
        filterArray.forEach(function(val) {
            filterMap[k][val] = true;
        });
    });

    function splitAndParse(dat) {
        // Split if not array
        if (!Array.isArray(dat)) {
            dat = dat.split(",");
        }

        return dat.map(function(part) {
            return parseFloat(part.trim(), 10);
        });
    }

    json = json.filter(function(point) {
        return !(["val", "x", "y", "z"].some(function(k) {
            return (filterMap[k][point[data[k]]]);
        }));
    });

    var stats = getDataStats(json, data, colorPreset)
    json.forEach(function(point){
        var vertex = new THREE.Vector3()
        if (data.xflip) {
            stats.scaleX.range([stats.width, 0])
        } else {
            stats.scaleX.range([0, stats.width])
        }

        if (data.yflip) {
            stats.scaleY.range([stats.height, 0])
        } else {
            stats.scaleY.range([0, stats.height])
        }

        if (data.zflip) {
            stats.scaleZ.range([stats.depth, 0])
        } else {
            stats.scaleZ.range([0, stats.depth])
        }

        vertex.x = stats.scaleX(point[data.x])
        vertex.y = stats.scaleY(point[data.y])
        vertex.z = stats.scaleZ(point[data.z])
        geometry.vertices.push( vertex )
        var c = stats.colorScale(point[data.val])
        geometry.colors.push(new THREE.Color(c))
    })
    var material = new THREE.PointsMaterial({
        size: data.pointsize * 0.006,
        vertexColors: THREE.VertexColors
    })
    var model = new THREE.Points( geometry, material )
    makeAxisAndKey(el, data, stats)

    el.setObject3D('particles', model)
}


        
        
function getDataStats(json, data, colorPreset) {
    var stats = {}

    // Get min max of all axis
    stats.minX   = d3.min(json, function(d) { return d[data.x]; });
    stats.maxX   = d3.max(json, function(d) { return d[data.x]; });
    stats.minY   = d3.min(json, function(d) { return d[data.y]; });
    stats.maxY   = d3.max(json, function(d) { return d[data.y]; });
    stats.minZ   = d3.min(json, function(d) { return d[data.z]; });
    stats.maxZ   = d3.max(json, function(d) { return d[data.z]; });
    stats.minS   = d3.min(json, function(d) { return d[data.s]; });
    stats.maxS   = d3.max(json, function(d) { return d[data.s]; });
    stats.minVal = d3.min(json, function(d) { return d[data.val]; });
    stats.maxVal = d3.max(json, function(d) { return d[data.val]; });
    
    stats.totalX = Math.abs(stats.minX) + Math.abs(stats.maxX);
    stats.totalZ = Math.abs(stats.minZ) + Math.abs(stats.maxZ);
    stats.totalY = Math.abs(stats.minY) + Math.abs(stats.maxY);

    var xz = false
    var xy = false
    var yz = false
    var xyz = false

    if (data.relationship == "xy" || data.relationship == "yx") {
        xy = true
    } else if (data.relationship == "xz" || data.relationship == "zx") {
        xz = true
    } else if (data.relationship == "yz" || data.relationship == "zy") {
        yz = true
    } else if (data.relationship == "xyz" || data.relationship == "yzx" || data.relationship == "zxy" || data.relationship == "xzy" || data.relationship == "yxz" || data.relationship == "zyx") {
        xyz = true
    }

    if (xy) {
        if (stats.totalX < stats.totalY) {
            var shape = stats.totalX/stats.totalY
            stats.height = 1
            stats.width = shape
        } else {
            var shape = stats.totalY/stats.totalX
            stats.height = shape
            stats.width = 1
        }
        stats.depth = data.zlimit
    } else if (xz) {
        if (stats.totalX < stats.totalZ) {
            var shape = stats.totalX/stats.totalZ
            stats.width = shape
            stats.depth = 1
        } else {
            var shape = stats.totalZ/stats.totalX
            stats.width = 1
            stats.depth = shape
        }
        stats.height = data.ylimit
    } else if (yz) {
        if (stats.totalY < stats.totalZ) {
            var shape = stats.totalY/stats.totalZ
            stats.height = shape
            stats.depth = 1
        } else {
            var shape = stats.totalZ/stats.totalY
            stats.depth = shape
            stats.height = 1
        }
        stats.width = data.xlimit
    } else if (xyz) {
        if (stats.totalX >= stats.totalY && stats.totalX >= stats.totalZ) {
            var shape1 = stats.totalZ/stats.totalX
            var shape2 = stats.totalY/stats.totalX
            stats.width = 1
            stats.height = shape2
            stats.depth = shape1
        } else if (stats.totalY >= stats.totalZ && stats.totalY >= stats.totalX) {
            var shape1 = stats.totalZ/stats.totalY
            var shape2 = stats.totalX/stats.totalY
            stats.width = shape2
            stats.height = 1
            stats.depth = shape1
        } else if (stats.totalZ >= stats.totalY && stats.totalZ >= stats.totalX) {
            var shape1 = stats.totalX/stats.totalZ
            var shape2 = stats.totalY/stats.totalZ
            stats.width = shape1
            stats.height = shape2
            stats.depth = 1
        }
    } else {
        stats.width = data.xlimit
        stats.height = data.ylimit
        stats.depth = data.zlimit
    }

    stats.scaleX = d3.scaleLinear().domain([stats.minX, stats.maxX]).range([0, stats.width])
    stats.scaleY = d3.scaleLinear().domain([stats.minY, stats.maxY]).range([0, stats.height])
    stats.scaleZ = d3.scaleLinear().domain([stats.minZ, stats.maxZ]).range([0, stats.depth])
    stats.scaleS = d3.scaleLinear().domain([stats.minS, stats.maxS]).range([0, 1])
    
    stats.colorScale = d3.scaleQuantile().domain([stats.minVal, stats.maxVal]).range(eval(colorPreset))
    
    return stats
}

AFRAME.registerPrimitive('a-scatterplot', {
    defaultComponents: {
        dataplot: {}
    },
    mappings: {
        src: 'dataplot.src',
        raw: 'dataplot.raw',
        title: 'dataplot.title',
        x: 'dataplot.x',
        y: 'dataplot.y',
        z: 'dataplot.z',
        s: 'dataplot.s',
        val: 'dataplot.val',
        colorpreset: 'dataplot.colorpreset',
        pointcolor: 'dataplot.pointcolor',
        valfil: 'dataplot.valfil',
        xfil: 'dataplot.xfil',
        yfil: 'dataplot.yfil',
        zfil: 'dataplot.zfil',
        sfil: 'dataplot.sfil',
        xlimit: 'dataplot.xlimit',
        ylimit: 'dataplot.ylimit',
        zlimit: 'dataplot.zlimit',
        relationship: 'dataplot.relationship',
        xflip: 'dataplot.xflip',
        yflip: 'dataplot.yflip',
        zflip: 'dataplot.zflip',
        xlabel: 'dataplot.xlabel',
        ylabel: 'dataplot.ylabel',
        zlabel: 'dataplot.zlabel',
        numdecimalplaces: 'dataplot.numdecimalplaces',
        nochrome: 'dataplot.nochrome',
        showticks: 'dataplot.showTicks',
        showticklabels: 'dataplot.showTickLabels',
        showfloor: 'dataplot.showFloor',
        floormaterialparams: 'dataplot.floorMaterialParams',
        cage: 'dataplot.cage',
        showcolorbar: 'dataplot.showcolorbar',
        pointsprite: 'dataplot.pointsprite',
        pointsize: 'dataplot.pointsize',
        showvalueonhover: 'dataplot.showValueOnHover'
    }
});
