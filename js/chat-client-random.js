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
    if (!chatClient.init(makeRandomChatClient)) {
        return;
    }
    $("button.leave").off().on("click", function () {
        $("button.leave").prop("disabled", true);
        if (tokenIssuanceTimer) {
            clearTimeout(tokenIssuanceTimer);
        }
        chatClient.closeSocket();
        setTimeout(function () {
            chatClient.leaveRoom();
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

function makeRandomChatClient(chatClient) {
    chatClient.printJoinMessage = function (chater, restored) {
        chatClient.removeConvoMessages();
        drawLookingBox();
    };

    chatClient.printUserJoinedMessage = function (payload, restored) {
        chatClient.removeConvoMessages();
        let chater = deserialize(payload.chater);
        let html = chatClientMessages.userJoined.replace("[username]", "<strong>" + chater.username + "</strong>");
        chatClient.printEventMessage(html, restored);
        if (chater.description) {
            let title = chatClientMessages.selfIntroductionTitle.replace("[username]", "<strong>" + chater.username + "</strong>");
            let selfIntro = $("<div class='self-introduction'/>");
            $("<p class='self-introduction-title'/>").html(title).appendTo(selfIntro);
            $("<p class='description'/>").text(chater.description).appendTo(selfIntro);
            if (chater.color) {
                selfIntro.addClass("my-col-" + chater.color);
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
        let chater = deserialize(payload.chater);
        let html = chatClientMessages.userLeft.replace("[username]", "<strong>" + chater.username + "</strong>");
        chatClient.printEventMessage(html, restored);
        $(".message-box button.send").prop("disabled", true).addClass("pause");
        stopLooking();
    };

    chatClient.serviceNotAvailable = function () {
        chatClient.closeSocket();
        chatClient.clearChaters();
        chatClient.removeConvoMessages();
        openNoticePopup(chatClientMessages.systemError,
            chatClientMessages.serviceNotAvailable,
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
            url: "/random/request",
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
                                chatClient.openSocket(response.token);
                        }
                    }
                } else {
                    chatClient.serviceNotAvailable();
                }
            },
            error: function () {
                chatClient.serviceNotAvailable();
            }
        });
    }, 1000);
    hideSidebar();
    chatClient.clearChaters();
    chatClient.removeConvoMessages();
    drawLookingBox(true);
}

function stopLooking(convoClear) {
    if (tokenIssuanceTimer) {
        clearTimeout(tokenIssuanceTimer);
    }
    hideSidebar();
    chatClient.closeSocket();
    chatClient.clearChaters();
    if (convoClear) {
        chatClient.removeConvoMessages();
    }
    drawSearchBox();
}

function drawSearchBox() {
    let html = "<div class='text-center'>" +
        "<i class='iconfont fi-shuffle banner'></i>" +
        "<button type='button' class='success button next'>" + chatClientMessages.searchAnother + "</button>" +
        "</div>";
    chatClient.printCustomMessage(html);
}

function drawLookingBox(intermission) {
    let banner;
    let title;
    if (intermission) {
        banner = "<i class='iconfont fi-shuffle banner'></i>";
        title = "<h3 class='wait'>" + chatClientMessages.wait + "</h3>";
    } else {
        banner = "<i class='iconfont fi-shuffle banner active'></i>";
        title = "<h3>" + chatClientMessages.looking + "</h3>";
    }
    let html = "<div class='text-center'>" + banner + title +
        "<div class='progress-bar'><div class='cylon_eye'></div></div>" +
        "<button type='button' class='success button cancel'>" + chatClientMessages.cancel + "</button>" +
        "</div>";
    chatClient.printCustomMessage(html);
    if (intermission) {
        setTimeout(function () {
            $("#convo .message.custom .banner").addClass("animate");
        }, 200);
    }
}