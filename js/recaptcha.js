let recaptchaClientIds = [];
let recaptchaResponse;

function loadCaptcha(action, container) {
    grecaptcha.ready(function () {
        recaptchaClientIds[action] = grecaptcha.render(container, {
            'sitekey': '6Ldt0r0UAAAAAP4ejDGFZLB0S-zDzWL3ZkB49FvN',
            'badge': 'inline',
            'size': 'invisible'
        });
    });
}

function executeCaptcha(action, callback) {
    grecaptcha.ready(function () {
        grecaptcha.execute(recaptchaClientIds[action], {
            action: action
        }).then(function (token) {
            recaptchaResponse = token;
            callback();
        });
    });
}