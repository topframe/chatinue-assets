let chatClient;
let broadcastEnabled = false;

$(function () {
    if (!userInfo.userId) {
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
        if (restored || !payload.text) {
            return;
        }
        let talker = deserialize(payload.talker);
        let convo = $("#convo");
        if (convo.find(".message").length >= 5) {
            convo.find(".message").first().remove();
        }
        let sender = $("<code class='sender'/>").text(talker.userName);
        let content = $("<p class='content'/>")
            .text(payload.text)
            .prepend(sender);
        let message = $("<div/>")
            .addClass("message")
            .data("user-id", talker.userId)
            .data("user-name", talker.userName)
            .append(content);
        if (talker.color) {
            message.addClass("my-col-" + talker.color);
        }
        convo.append(message);
        chatClient.scrollToBottom(convo, false);
        setTimeout(function () {
            message.remove();
        }, 10000);
    };

    chatClient.printNotice = function (payload) {
        switch (payload.type) {
            case "usersByCountry": {
                let usersByCountry = deserialize(payload.text);
                drawUsersByCountry(usersByCountry);
                break;
            }
            case "chatCreated": {
                let chatInfo = deserialize(payload.text);
                let currentChatLang = $(".chats-options select[name=chat_lang]").val();
                if (chatInfo.language === currentChatLang) {
                    let chatCreatedMsg = replaceMessageArguments(
                        chatClientMessages.chatCreated, "chatName", chatInfo.chatName);
                    chatClient.printEventMessage(chatCreatedMsg);
                    refreshChats(chatInfo.language);
                }
                break;
            }
            case "chatUpdated": {
                let chatInfo = deserialize(payload.text);
                let currentChatLang = $(".chats-options select[name=chat_lang]").val();
                if (chatInfo.language === currentChatLang) {
                    $(".chats .chat").filter(function () {
                        return $(this).data("chat-id") === chatInfo.chatId;
                    }).each(function () {
                        let chat = $(this);
                        chat.find(".curr-users span").text(chatInfo.currentUsers);
                        if (chatInfo.currentUsers > 0) {
                            chat.addClass("active");
                        } else {
                            chat.removeClass("active");
                        }
                    });
                }
                break;
            }
        }
    };

    chatClient.printJoinMessage = function (talker, restored) {
    };

    chatClient.printUserJoinedMessage = function (payload, restored) {
        if (restored) {
            return;
        }
        let talker = deserialize(payload.talker);
        let userJoinedMsg = replaceMessageArguments(chatClientMessages.userJoined, "name", talker.userName);
        chatClient.printEventMessage(userJoinedMsg);
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

    chatClient.leaveChat = function (force) {
        chatClient.closeSocket();
        if (force) {
            location.href = "/sign-out";
        } else {
            chatClient.gotoHome();
        }
    };

    chatClient.gotoHome = function () {
        chatClient.leaveChat(true);
    };
}
