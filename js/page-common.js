$(function () {
    $(document).foundation();

    $(".header button.sidebar-toggler").on("click", function () {
        $(this).blur();
        toggleSidebar();
    });
    $(".button.signin").on("click", function () {
        openSignInPopup();
    });
    $(".button.signout").on("click", function () {
        location.href = "/signout";
    });
    $("#form-sign-in").submit(function () {
        let username = $("#form-sign-in input[name=username]").val().trim();
        if (!username) {
            $("#form-sign-in input[name=username]").focus();
            return false;
        }
        $("#form-sign-in input[name=username]").val(username);
        executeCaptcha("sign_in", startSignIn);
        return false;
    });
    $("#form-sign-in input[name=remember-me]").on("change", function () {
        if (!this.checked) {
            localStorage.removeItem("username");
            localStorage.removeItem("favoriteColor");
        }
    });
    $("#common-sign-in .my-col-box").on("click", function () {
        $("#common-sign-in .my-col-box").removeClass("selected");
        $(this).addClass("selected");
    });
    $("#common-sign-in .cancel").on("click", function () {
        if (location.pathname !== "/") {
            location.href = "/";
        } else {
            $("#common-sign-in").foundation('close');
        }
    });
});

function toggleSidebar() {
    $(".sidebar").toggleClass("hide-for-small-only").toggleClass("show-for-small-only");
}

function hideSidebar() {
    let sidebar = $(".sidebar");
    if (sidebar.is(":visible") && !sidebar.hasClass("hide-for-small-only")) {
        toggleSidebar();
    }
}

function checkSignedIn() {
    if (!userInfo.userNo) {
        openSignInPopup();
        return false;
    }
    return true;
}

function openSignInPopup() {
    $("#common-sign-in").foundation('open');
    $("#form-sign-in .form-error").hide();
    if ($("#captcha-container-sign-in").is(":empty")) {
        loadCaptcha("sign_in", "captcha-container-sign-in");
    }
    let username = localStorage.getItem("username");
    let description = localStorage.getItem("description");
    let favoriteColor = Number(localStorage.getItem("favoriteColor"));
    if (username) {
        $("#form-sign-in input[name=remember-me]").prop("checked", true);
    }
    if (favoriteColor < 1 || favoriteColor > 7) {
        favoriteColor = Math.floor(Math.random() * 7) + 1;
    }
    $("#common-sign-in .my-col-box").removeClass("selected");
    $("#common-sign-in .my-col-" + favoriteColor).addClass("selected");
    $("#form-sign-in textarea[name=description]").val(description);
    $("#form-sign-in input[name=username]").val(username).focus();
}

let startSignInTimer;
function startSignIn() {
    if (startSignInTimer) {
        clearTimeout(startSignInTimer);
        startSignInTimer = null;
    }
    $("#common-sign-in").foundation('close');
    let username = $("#form-sign-in input[name=username]").val().trim();
    let description = $("#form-sign-in textarea[name=description]").val().trim();
    if (username) {
        let favoriteColor = $("#common-sign-in .my-col-box.selected").text();
        if ($("#form-sign-in input[name='remember-me']").prop("checked")) {
            localStorage.setItem("username", username);
            localStorage.setItem("description", description);
            localStorage.setItem("favoriteColor", favoriteColor);
        } else {
            localStorage.removeItem("username");
            localStorage.removeItem("description");
            localStorage.removeItem("favoriteColor");
        }
        openWaitPopup(modalMessages.signingIn, function () {
            location.reload();
        }, 10000);
        startSignInTimer = setTimeout(function () {
            doSignIn(username, description, favoriteColor);
        }, 600);
    }
}

function doSignIn(username, description, favoriteColor) {
    if (!recaptchaResponse) {
        return;
    }
    $.ajax({
        url: '/signin',
        type: 'post',
        dataType: 'json',
        data: {
            username: username,
            description: description,
            favoriteColor: favoriteColor,
            recaptchaResponse: recaptchaResponse,
            timeZone: getTimeZone()
        },
        success: function (result) {
            switch (result) {
                case "0":
                    location.reload();
                    break;
                case "-1":
                    closeWaitPopup();
                    alert("reCAPTCHA verification failed");
                    break;
                case "-2":
                    closeWaitPopup();
                    openSignInPopup();
                    $("#form-sign-in .form-error.already-in-use").show();
                    $("#form-sign-in input[name=username]").val(username).focus();
                    break;
                case "-3":
                    closeWaitPopup();
                    alert(modalMessages.alreadySignedIn);
                    location.reload();
                    break;
                default:
                    closeWaitPopup();
                    console.error(result);
                    alert("Unexpected error occurred.");
            }
        },
        error: function (request, status, error) {
            closeWaitPopup();
            alert("An error has occurred making the request: " + error);
        }
    });
}

function openNoticePopup(title, message, action) {
    let p = $("<p/>").text(message);
    let popup = $("#common-notice-popup");
    popup.find("h3").text(title);
    popup.find(".content").html("").append(p);
    popup.find(".ok").off().on("click", function () {
        if (action) {
            action();
        }
        popup.foundation('close');
    });
    popup.foundation('open');
}

let openWaitPopupTimer;
function openWaitPopup(message, action, timeout) {
    if (openWaitPopupTimer) {
        clearTimeout(openWaitPopupTimer);
        openWaitPopupTimer = null;
    }
    let p = $("<p/>").text(message);
    let popup = $("#common-wait-popup");
    popup.find(".content").html("").append(p);
    popup.find(".button.cancel").hide().off().on("click", function () {
        if (action) {
            action();
        }
        closeWaitPopup();
    });
    popup.foundation('open');
    popup.find(".banner").addClass("animate");
    if (timeout > 0) {
        openWaitPopupTimer = setTimeout(function () {
            popup.find(".button.cancel").show();
        }, timeout);
    } else {
        popup.find(".button.cancel").show();
    }
}

function closeWaitPopup() {
    let popup = $("#common-wait-popup");
    popup.find(".banner").removeClass("animate");
    popup.foundation('close');
}