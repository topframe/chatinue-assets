let chatClient;
let broadcastEnabled = false;

$(function () {
    if (!userInfo.userNo) {
        return;
    }
    if (!Modernizr.websockets || detectIE()) {
        $("#message").blur();
        $("#message, #form-send-message button").prop("disabled", true);
        location.href = "/error/browser-not-supported";
        return false;
    }
    chatClient = new ChatClientCore(chatClientSettings);
    if (!chatClient.init(makeLobbyChatClient)) {
        return;
    }
    broadcastEnabled = true;
    $("#form-send-message button.quiet").on("click", function () {
        broadcastEnabled = !broadcastEnabled;
        if (broadcastEnabled) {
            $(this).removeClass("pause");
            $("#message, #form-send-message button.send").prop("disabled", false);
            $("#convo").show();
        } else {
            $(this).addClass("pause");
            $("#message, #form-send-message button.send").prop("disabled", true);
            $("#convo").hide();
        }
    });
});

function makeLobbyChatClient(chatClient) {
    chatClient.printMessage = function (payload, restored) {
        if (payload.content.startsWith("broadcast:")) {
            if (broadcastEnabled) {
                chatClient.printBroadcastMessage(payload);
            }
        } else {
            chatClient.handleSystemMessage(payload.content);
        }
    };

    chatClient.printBroadcastMessage = function (payload) {
        let chater = deserialize(payload.chater);
        let convo = $("#convo");
        if (convo.find(".message").length >= 5) {
            convo.find(".message").first().remove();
        }
        let sender = $("<code class='sender'/>").text(chater.username);
        let content = $("<p class='content'/>")
            .text(payload.content.substring(10))
            .prepend(sender);
        let message = $("<div/>")
            .addClass("message")
            .data("user-no", chater.userNo)
            .data("username", chater.username)
            .append(content);
        if (chater.color) {
            message.addClass("my-col-" + chater.color);
        }
        convo.append(message);
        chatClient.scrollToBottom(convo, false);
        setTimeout(function () {
            message.remove();
        }, 10000);
    };

    chatClient.handleSystemMessage = function (content) {
        if (!content) {
            return;
        }
        if (content.startsWith("usersByCountry:")) {
            let usersByCountry = deserialize(content.substring(15));
            drawUsersByCountry(usersByCountry);
        } else if (content.startsWith("newPublicRoom:")) {
            let roomInfo = deserialize(content.substring(14));
            let currentRoomLang = $(".rooms-options select[name=room_lang]").val();
            if (roomInfo.language === currentRoomLang) {
                let html = chatClientMessages.roomCreated.replace("[roomName]", "<code>" + roomInfo.roomName + "</code>");
                chatClient.printEventMessage(html);
                refreshRooms(roomInfo.language);
            }
        } else if (content.startsWith("updatedPublicRoom:")) {
            let roomInfo = deserialize(content.substring(18));
            let currentRoomLang = $(".rooms-options select[name=room_lang]").val();
            if (roomInfo.language === currentRoomLang) {
                $(".rooms .room").filter(function () {
                    return $(this).data("room-id") === roomInfo.roomId;
                }).each(function () {
                    let room = $(this);
                    room.find(".curr-users span").text(roomInfo.currentUsers);
                    if (roomInfo.currentUsers > 0) {
                        room.addClass("active");
                    } else {
                        room.removeClass("active");
                    }
                });
            }
        }
    };

    chatClient.printJoinMessage = function (chater, restored) {
    };

    chatClient.printUserJoinedMessage = function (payload, restored) {
        let chater = deserialize(payload.chater);
        chatClient.printEventMessage(chatClientMessages.userJoined.replace("[username]", "<strong>" + chater.username + "</strong>"));
    };

    chatClient.printUserLeftMessage = function (payload, restored) {
    };

    chatClient.printEventMessage = function (html, timeout) {
        if (!broadcastEnabled) {
            return;
        }
        let convo = $("#convo");
        let content = $("<p class='content'/>").html(html);
        let message = $("<div/>").addClass("message").append(content);
        message.appendTo(convo);
        chatClient.scrollToBottom(convo, false);
        setTimeout(function () {
            message.remove();
        }, timeout || 3500);
    };

    chatClient.leaveRoom = function (force) {
        chatClient.closeSocket();
        if (force) {
            location.href = "/signout";
        } else {
            chatClient.gotoHome();
        }
    };

    chatClient.gotoHome = function () {
        chatClient.leaveRoom(true);
    };
}