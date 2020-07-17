let recentlyCreatedRoomId;

$(function () {
    $(".service a.guide").on("click", function () {
       $(this).parent().find("p.guide").toggleClass("show-for-medium");
    });
    $(".public-room-create").on("click", function () {
        if (!checkSignedIn()) {
            return false;
        }
        $("#lobby-public-room-create").foundation('open');
        $("#form-public-room-create .form-error").hide();
        $("#form-public-room-create").each(function () {
            this.reset();
        });
        $("#form-public-room-create select[name=lang_cd] option").filter(function () {
            return $(this).val() === userInfo.language;
        }).each(function () {
            $("#form-public-room-create select[name=lang_cd]").val(userInfo.language);
        });
        if ($("#captcha-container-public-room-create").is(":empty")) {
            loadCaptcha("public_room_create", "captcha-container-public-room-create");
        }
        $("#form-public-room-create input[name=room_nm]").focus();
    });
    $("#form-public-room-create").submit(function () {
        executeCaptcha("public_room_create", doCreatePublicRoom);
        return false;
    });
    $("button.go-created-public-room").on("click", function () {
        if (recentlyCreatedRoomId) {
            if (chatClient) {
                chatClient.closeSocket();
            }
            location.href = "/rooms/" + recentlyCreatedRoomId;
        }
    });
    $(".private-room-create").on("click", function () {
        if (!checkSignedIn()) {
            return false;
        }
        $("#lobby-private-room-create").foundation('open');
        $("#form-private-room-create").each(function () {
            this.reset();
        });
        if ($("#captcha-container-private-room-create").is(":empty")) {
            loadCaptcha("private_room_create", "captcha-container-private-room-create");
        }
        $("#form-private-room-create input[name=room_nm]").focus();
    });
    $("#form-private-room-create").submit(function () {
        executeCaptcha("private_room_create", doCreatePrivateRoom);
        return false;
    });
    $("button.go-created-private-room").on("click", function () {
        if (recentlyCreatedRoomId) {
            if (chatClient) {
                chatClient.closeSocket();
            }
            location.href = "/private/" + recentlyCreatedRoomId;
        }
    });
    $("#lobby-private-room-create-complete").on("click", ".copy-to-clipboard", function () {
        copyToClipboard("#lobby-private-room-create-complete .private-chatroom-url");
        $(this).data("old-text", $(this).text()).text(modalMessages.copied).addClass("secondary");
    });
    $("a.start[href]").on("click", function (event) {
        event.preventDefault();
        if (chatClient) {
            chatClient.closeSocket();
        }
        location.href = $(this).attr("href");
    });
    $(".service.random a.start").off().on("click", function (event) {
        event.preventDefault();
        if (chatClient) {
            chatClient.closeSocket();
        }
        let convoLang = $(".service-options select[name=convo_lang]").val();
        if (convoLang) {
            location.href = $(this).attr("href") + "?convo_lang=" + convoLang;
        } else {
            location.href = $(this).attr("href");
        }
    });
    $(".service-options select[name=convo_lang]").on("change", function () {
        if ($(this).val()) {
            sessionStorage.setItem("convoLang", $(this).val());
        } else {
            sessionStorage.removeItem("convoLang");
        }
    });
    let convoLang = sessionStorage.getItem("convoLang");
    if (convoLang) {
        $(".service-options select[name=convo_lang] option").filter(function () {
            return $(this).val() === convoLang;
        }).each(function () {
            $(".service-options select[name=convo_lang]").val(convoLang);
        });
    }
    $(".refresh-rooms").on("click", function () {
        refreshRooms();
    });
    $(".rooms-options select[name=room_lang]").change(function () {
        refreshRooms();
        $(this).blur();
        sessionStorage.setItem("roomLang", $(this).val());
    });
    let roomLang = sessionStorage.getItem("roomLang");
    if (!roomLang) {
        roomLang = userInfo.language;
    }
    refreshRooms(roomLang, true);
});

function doCreatePublicRoom() {
    if (!recaptchaResponse) {
        return;
    }
    $("#form-public-room-create .form-error").hide();
    let roomName = $("#form-public-room-create input[name=room_nm]").val().trim();
    let langCode = $("#form-public-room-create select[name=lang_cd]").val().trim();
    if (!roomName) {
        $("#form-public-room-create .form-error.room-name-required").show();
        $("#form-public-room-create input[name=room_nm]").focus();
        return;
    }
    $.ajax({
        url: '/rooms',
        type: 'post',
        dataType: 'json',
        data: {
            room_nm: roomName,
            lang_cd: langCode,
            recaptchaResponse: recaptchaResponse
        },
        success: function (result) {
            recentlyCreatedRoomId = null;
            switch (result) {
                case "-1":
                    alert("reCAPTCHA verification failed");
                    location.reload();
                    break;
                case "-2":
                    $("#form-public-room-create .form-error.already-in-use").show();
                    $("#form-public-room-create input[name=room_nm]").select().focus();
                    break;
                default:
                    if (!result) {
                        alert("Unexpected error occurred.");
                        location.reload();
                        return;
                    }
                    $("#form-public-room-create input[name=room_nm]").val("");
                    recentlyCreatedRoomId = result;
                    $("#lobby-public-room-create").foundation('close');
                    $("#lobby-public-room-create-complete").foundation('open');
            }
        },
        error: function (request, status, error) {
            alert("An error has occurred making the request: " + error);
        }
    });
}

function doCreatePrivateRoom() {
    if (!recaptchaResponse) {
        return;
    }
    $("#form-private-room-create .form-error").hide();
    let roomName = $("#form-private-room-create input[name=room_nm]").val().trim();
    if (!roomName) {
        $("#form-private-room-create .form-error.room-name-required").show();
        $("#form-private-room-create input[name=room_nm]").focus();
        return;
    }
    $.ajax({
        url: '/private',
        type: 'post',
        dataType: 'json',
        data: {
            room_nm: roomName,
            recaptchaResponse: recaptchaResponse
        },
        success: function (result) {
            recentlyCreatedRoomId = null;
            switch (result) {
                case "-1":
                    alert("reCAPTCHA verification failed");
                    location.reload();
                    break;
                default:
                    if (!result) {
                        alert("Unexpected error occurred.");
                        location.reload();
                        return;
                    }
                    recentlyCreatedRoomId = result;
                    let url = "https://textchat.club/private/" + result;
                    $("#form-private-room-create input[name=room_nm]").val("");
                    $("#lobby-private-room-create").foundation('close');
                    $("#lobby-private-room-create-complete").foundation('open');
                    let oldText = $("#lobby-private-room-create-complete .copy-to-clipboard").data("old-text");
                    if (oldText) {
                        $("#lobby-private-room-create-complete .copy-to-clipboard").text(oldText).removeClass("alert");
                    }
                    $("#lobby-private-room-create-complete .private-chatroom-url").text(url);
            }
        },
        error: function (request, status, error) {
            alert("An error has occurred making the request: " + error);
        }
    });
}

let refreshRoomsTimer;
function refreshRooms(roomLang, recursable) {
    if (refreshRoomsTimer) {
        clearTimeout(refreshRoomsTimer);
        refreshRoomsTimer = null;
    }
    if (roomLang) {
        $(".rooms-options select[name=room_lang] option").filter(function () {
            return $(this).val() === roomLang;
        }).each(function () {
            $(".rooms-options select[name=room_lang]").val(roomLang);
        });
    } else {
        roomLang = $(".rooms-options select[name=room_lang]").val();
    }
    refreshRoomsTimer = setTimeout(function () {
        $.ajax({
            url: '/lobby/rooms',
            data: {
                lang_cd: roomLang
            },
            type: 'get',
            dataType: 'json',
            success: function (list) {
                if (!list || !list.length) {
                    if (recursable && roomLang !== "en") {
                        $(".no-rooms .button.start").hide();
                        setTimeout(function () {
                            sessionStorage.setItem("roomLang", "en");
                            refreshRooms("en", false);
                        }, 1500);
                    } else {
                        $(".no-rooms .button.start").show();
                    }
                    $(".rooms .room:visible").remove();
                    $(".rooms").hide();
                    $(".no-rooms").fadeIn();
                    return;
                }
                $(".no-rooms").hide();
                $(".rooms").show();
                $(".rooms .room:visible").remove();
                for (let i in list) {
                    let roomInfo = list[i];
                    let room = $(".rooms .room.template").clone().removeClass("template");
                    room.data("room-id", roomInfo.roomId);
                    room.find("a").attr("href", "/rooms/" + roomInfo.roomId);
                    room.find("h5").text(roomInfo.roomName);
                    room.find(".curr-users span").text(roomInfo.currentUsers);
                    if (roomInfo.currentUsers > 0) {
                        room.addClass("active");
                    }
                    if (roomInfo.pastDays >= 2) {
                        room.find(".new").hide();
                    }
                    room.appendTo($(".rooms")).hide().fadeIn();
                }
            },
            error: function () {
                location.reload();
            }
        });
    }, 100);
}