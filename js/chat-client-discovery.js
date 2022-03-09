let chatClient;
let tokenIssuanceTimer;
let tokenIssuanceCanceled;

$(function () {
    $(".users-by-country-container").hide();
    if (!checkSignedIn()) {
        $("#message").blur();
        $("#message, #form-send-message button").prop("disabled", true);
        return false;
    }
    chatClient = new ChatClientCore(chatClientSettings);
    if (!chatClient.init(makeDiscoveryChatClient)) {
        return;
    }
    $("button.leave").off().on("click", function () {
        $("button.leave").prop("disabled", true);
        if (tokenIssuanceTimer) {
            clearTimeout(tokenIssuanceTimer);
        }
        chatClient.closeSocket();
        setTimeout(function () {
            chatClient.leaveChat();
        }, 500);
    });
    $(".message-box button.send").prop("disabled", true).addClass("pause");
    $(".message-box button.next").on("click", function () {
        $(".message-box button.send").prop("disabled", true).addClass("pause");
        chatClient.closeSocket();
        startLooking();
    });
    $("#convo").on("click", ".message.custom button.next", function () {
        $(".message-box button.next").click();
    }).on("click", ".message.custom button.cancel", function () {
        stopLooking(true);
    });
    $(".users-by-country-container").show();
    startLooking();
});

function makeDiscoveryChatClient(chatClient) {
    chatClient.printJoinMessage = function (talker, restored) {
        chatClient.removeConvoMessages();
        drawLookingFriendsBox();
    };

    chatClient.printUserJoinedMessage = function (payload, restored) {
        chatClient.removeConvoMessages();
        let talker = deserialize(payload.talker);
        let userJoinedMsg = replaceMessageArguments(chatClientMessages.chatStarted, "name", talker.userName);
        chatClient.printEventMessage(userJoinedMsg, restored);
        if (talker.aboutMe) {
            let title = replaceMessageArguments(chatClientMessages.aboutMeTitle, "name", talker.userName);
            let selfIntro = $("<div class='about-me'/>");
            $("<p class='about-me-title'/>").html(title).appendTo(selfIntro);
            $("<p class='aboutMe'/>").text(talker.aboutMe).appendTo(selfIntro);
            if (talker.color) {
                selfIntro.addClass("my-col-" + talker.color);
            }
            chatClient.printCustomMessage(selfIntro);
        }
        $(".message-box button.send").prop("disabled", false).removeClass("pause");
        chatClient.readyToType();
        setTimeout(function () {
            hideSidebar();
        }, 500);
    };

    chatClient.printUserLeftMessage = function (payload, restored) {
        let talker = deserialize(payload.talker);
        let userLeftMsg = replaceMessageArguments(chatClientMessages.userLeft, "name", talker.userName);
        chatClient.printEventMessage(userLeftMsg, restored);
        $(".message-box button.send").prop("disabled", true).addClass("pause");
        stopLooking();
    };

    chatClient.serviceUnavailable = function () {
        chatClient.closeSocket();
        chatClient.clearTalkers();
        chatClient.removeConvoMessages();
        openNoticePopup(chatClientMessages.systemError,
            chatClientMessages.serviceUnavailable,
            function () {
                chatClient.gotoHome();
            });
    };
}

function startLooking() {
    if (tokenIssuanceTimer) {
        tokenIssuanceCanceled = true;
        clearTimeout(tokenIssuanceTimer);
    }
    tokenIssuanceCanceled = false;
    tokenIssuanceTimer = setTimeout(function () {
        $.ajax({
            url: "/discovery/request",
            method: 'GET',
            dataType: 'json',
            success: function (response) {
                if (response) {
                    if (response.usersByCountry) {
                        drawUsersByCountry(response.usersByCountry, 1);
                    }
                    if (!tokenIssuanceCanceled) {
                        switch (response.error) {
                            case -1:
                                chatClient.reloadPage();
                                break;
                            case 0:
                                hideSidebar();
                                chatClient.openSocket(response.talkerToken);
                        }
                    }
                } else {
                    chatClient.serviceUnavailable();
                }
            },
            error: function () {
                chatClient.serviceUnavailable();
            }
        });
    }, 1000);
    hideSidebar();
    chatClient.clearTalkers();
    chatClient.removeConvoMessages();
    drawLookingFriendsBox(true);
}

function stopLooking(convoClear) {
    if (tokenIssuanceTimer) {
        clearTimeout(tokenIssuanceTimer);
    }
    hideSidebar();
    chatClient.closeSocket();
    chatClient.clearTalkers();
    if (convoClear) {
        chatClient.removeConvoMessages();
    }
    drawFiendAnotherBox();
}

function drawFiendAnotherBox() {
    let html = "<div class='text-center'>" +
        "<i class='iconfont fi-shuffle banner'></i>" +
        "<button type='button' class='success button next'>" +
        chatClientMessages.findAnother + "</button>" +
        "</div>";
    chatClient.printCustomMessage(html);
}

function drawLookingFriendsBox(intermission) {
    let banner;
    let title;
    if (intermission) {
        banner = "<i class='iconfont fi-shuffle banner'></i>";
        title = "<h3 class='wait'>" + chatClientMessages.wait + "</h3>";
    } else {
        banner = "<i class='iconfont fi-shuffle banner active'></i>";
        title = "<h3>" + chatClientMessages.lookingFriends + "</h3>";
    }
    let html = "<div class='text-center'>" + banner + title +
        "<div class='progress-bar'><div class='cylon_eye'></div></div>" +
        "<button type='button' class='success button cancel'>" +
        chatClientMessages.cancel + "</button>" +
        "</div>";
    chatClient.printCustomMessage(html);
    if (intermission) {
        setTimeout(function () {
            $("#convo .message.custom .banner").addClass("animate");
        }, 200);
    }
}
