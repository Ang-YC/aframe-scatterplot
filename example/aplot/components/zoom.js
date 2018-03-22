AFRAME.registerComponent('zoom', {
    init: function () {
        this.ZOOM_IN_STATE = 'zoom_in';
        this.ZOOM_OUT_STATE = 'zoom_out';
        this.onKeydown = this.onKeydown.bind(this);
        this.onKeyup = this.onKeyup.bind(this);
    },

    play: function () {
        window.addEventListener('keydown', this.onKeydown);
        window.addEventListener('keyup', this.onKeyup);
    },

    pause: function () {
        window.addEventListener('keydown', this.onKeydown);
        window.addEventListener('keyup', this.onKeyup);
    },

    onKeydown: function (evt) {
        if (evt.keyCode == 190) { // spin left
            this.el.addState(this.ZOOM_IN_STATE);
        }
        if (evt.keyCode == 188) {
            this.el.addState(this.ZOOM_OUT_STATE);
        }
    },

    onKeyup: function (evt) {
        if (evt.keyCode == 190) { // spin left
            this.el.removeState(this.ZOOM_IN_STATE);
        }
        if (evt.keyCode == 188) {
            this.el.removeState(this.ZOOM_OUT_STATE);
        }
    },

    tick: function () {
        var el = this.el;
        var scale = el.getAttribute('scale');
        if (el.is(this.ZOOM_OUT_STATE)) {
            el.setAttribute('scale', new THREE.Vector3(scale.x*0.99, scale.y*0.99, scale.z*0.99));
        }
        if (el.is(this.ZOOM_IN_STATE)) {
            el.setAttribute('scale', new THREE.Vector3(scale.x*1.01, scale.y*1.01, scale.z*1.01));
        }
    }
});