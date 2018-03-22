AFRAME.registerComponent('spin', {
    init: function () {
        this.SPIN_LEFT_STATE = 'rotate_left';
        this.SPIN_RIGHT_STATE = 'rotate_right';
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
        if (evt.keyCode == 74) { // spin left
            this.el.addState(this.SPIN_LEFT_STATE);
        }
        if (evt.keyCode == 75) {
            this.el.addState(this.SPIN_RIGHT_STATE);
        }
    },

    onKeyup: function (evt) {
        if (evt.keyCode == 74) { // spin left
            this.el.removeState(this.SPIN_LEFT_STATE);
        }
        if (evt.keyCode == 75) {
            this.el.removeState(this.SPIN_RIGHT_STATE);
        }
    },

    tick: function () {
        var el = this.el;
        var rotation = el.getAttribute('rotation');
        if (el.is(this.SPIN_LEFT_STATE)) {
            el.setAttribute('rotation', new THREE.Vector3(rotation.x, rotation.y - 1, rotation.z));
        }
        if (el.is(this.SPIN_RIGHT_STATE)) {
            el.setAttribute('rotation', new THREE.Vector3(rotation.x, rotation.y + 1, rotation.z));
        }
    }
});