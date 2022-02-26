$(function () {
    $(document).foundation();

    $(".header .button.back").on("click", function (e) {
        if (appNavigation) {
            appNavigation.postMessage("back");
            e.preventDefault();
        }
    });
    $(".header button.sidebar-toggler").on("click", function () {
        $(this).blur();
        toggleSidebar();
    });
    $(".button.sign-in").on("click", function () {
        openSignInPopup();
    });
    $(".button.sign-out").on("click", function () {
        location.href = "/sign-out";
    });
    $("#form-sign-in").submit(function () {
        let name = $("#form-sign-in input[name=name]").val().trim();
        if (!name) {
            $("#form-sign-in input[name=name]").focus();
            return false;
        }
        $("#form-sign-in input[name=name]").val(name);
        startSignIn();
        return false;
    });
    $("#form-sign-in input[name=remember-me]").on("change", function () {
        if (!this.checked) {
            localStorage.removeItem("name");
            localStorage.removeItem("color");
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
    if (!userInfo.userId) {
        openSignInPopup();
        return false;
    }
    return true;
}

function openSignInPopup() {
    $("#common-sign-in").foundation('open');
    $("#form-sign-in .form-error").hide();
    let name = localStorage.getItem("name");
    let aboutMe = localStorage.getItem("aboutMe");
    let color = Number(localStorage.getItem("color"));
    if (name) {
        $("#form-sign-in input[name=remember-me]").prop("checked", true);
    }
    if (color < 1 || color > 7) {
        color = Math.floor(Math.random() * 7) + 1;
    }
    $("#common-sign-in .my-col-box").removeClass("selected");
    $("#common-sign-in .my-col-" + color).addClass("selected");
    $("#form-sign-in textarea[name=aboutMe]").val(aboutMe);
    $("#form-sign-in input[name=name]").val(name).focus();
}

let startSignInTimer;
function startSignIn() {
    if (startSignInTimer) {
        clearTimeout(startSignInTimer);
        startSignInTimer = null;
    }
    $("#common-sign-in").foundation('close');
    let name = $("#form-sign-in input[name=name]").val().trim();
    let aboutMe = $("#form-sign-in textarea[name=about_me]").val().trim();
    if (name) {
        let color = $("#common-sign-in .my-col-box.selected").text();
        if ($("#form-sign-in input[name='remember-me']").prop("checked")) {
            localStorage.setItem("name", name);
            localStorage.setItem("aboutMe", aboutMe);
            localStorage.setItem("color", color);
        } else {
            localStorage.removeItem("name");
            localStorage.removeItem("aboutMe");
            localStorage.removeItem("color");
        }
        openWaitPopup(modalMessages.signingIn, function () {
            location.reload();
        }, 10000);
        startSignInTimer = setTimeout(function () {
            doSignIn(name, aboutMe, color);
        }, 600);
    }
}

function doSignIn(name, aboutMe, color) {
    $.ajax({
        url: '/sign-in',
        type: 'post',
        dataType: 'json',
        data: {
            name: name,
            aboutMe: aboutMe,
            color: color,
            timeZone: getTimeZone()
        },
        success: function (result) {
            switch (result) {
                case "0":
                    location.reload();
                    break;
                case "-2":
                    closeWaitPopup();
                    openSignInPopup();
                    $("#form-sign-in .form-error.already-in-use").show();
                    $("#form-sign-in input[name=name]").val(name).focus();
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
