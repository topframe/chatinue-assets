let recentlyCreatedChatId;

$(function () {
    $(".service a.guide").on("click", function () {
       $(this).parent().find("p.guide").toggleClass("show-for-medium");
    });
    $(".public-chat-create").on("click", function () {
        if (!checkSignedIn()) {
            return false;
        }
        $("#lobby-public-chat-create").foundation('open');
        $("#form-public-chat-create .form-error").hide();
        $("#form-public-chat-create").each(function () {
            this.reset();
        });
        $("#form-public-chat-create select[name=lang_cd] option").filter(function () {
            return $(this).val() === userInfo.language;
        }).each(function () {
            $("#form-public-chat-create select[name=lang_cd]").val(userInfo.language);
        });
        $("#form-public-chat-create input[name=chat_nm]").focus();
    });
    $("#form-public-chat-create").submit(function () {
        doCreatePublicChat();
        return false;
    });
    $("button.go-created-public-chat").on("click", function () {
        if (recentlyCreatedChatId) {
            if (chatClient) {
                chatClient.closeSocket();
            }
            location.href = "/chats/" + recentlyCreatedChatId;
        }
    });
    $(".private-chat-create").on("click", function () {
        if (!checkSignedIn()) {
            return false;
        }
        $("#lobby-private-chat-create").foundation('open');
        $("#form-private-private-create").each(function () {
            this.reset();
        });
        $("#form-private-chat-create input[name=chat_nm]").focus();
    });
    $("#form-private-chat-create").submit(function () {
        doCreatePrivateChat();
        return false;
    });
    $("button.go-created-private-chat").on("click", function () {
        if (recentlyCreatedChatId) {
            if (chatClient) {
                chatClient.closeSocket();
            }
            location.href = "/private/" + recentlyCreatedChatId;
        }
    });
    $("#lobby-private-chat-create-complete").on("click", ".copy-to-clipboard", function () {
        copyToClipboard("#lobby-private-chat-create-complete .private-chat-url");
        $(this).data("old-text", $(this).text()).text(modalMessages.copied).addClass("secondary");
    });
    $("a.start[href]").on("click", function (event) {
        event.preventDefault();
        if (chatClient) {
            chatClient.closeSocket();
        }
        location.href = $(this).attr("href");
    });
    $(".service.discovery a.start").off().on("click", function (event) {
        event.preventDefault();
        if (chatClient) {
            chatClient.closeSocket();
        }
        let convoLang = $(".service-options select[name=convo_lang]").val();
        if (convoLang) {
            location.href = $(this).attr("href") + "?lang=" + convoLang;
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
    $(".refresh-chats").on("click", function () {
        refreshChats();
    });
    $(".chats-options select[name=chat_lang]").change(function () {
        refreshChats();
        $(this).blur();
        sessionStorage.setItem("chatLang", $(this).val());
    });
    let chatLang = sessionStorage.getItem("chatLang");
    if (!chatLang) {
        chatLang = userInfo.language;
    }
    refreshChats(chatLang, true);
});

function doCreatePublicChat() {
    $("#form-public-chat-create .form-error").hide();
    let chatName = $("#form-public-chat-create input[name=chat_nm]").val().trim();
    let langCode = $("#form-public-chat-create select[name=lang_cd]").val().trim();
    if (!chatName) {
        $("#form-public-chat-create .form-error.chat-name-required").show();
        $("#form-public-chat-create input[name=chat_nm]").focus();
        return;
    }
    $.ajax({
        url: '/chats',
        type: 'post',
        dataType: 'json',
        data: {
            chat_nm: chatName,
            lang_cd: langCode
        },
        success: function (result) {
            recentlyCreatedChatId = null;
            switch (result) {
                case -2:
                    $("#form-public-chat-create .form-error.already-in-use").show();
                    $("#form-public-chat-create input[name=chat_nm]").select().focus();
                    break;
                default:
                    if (result <= 0) {
                        alert("Unexpected error occurred.");
                        location.reload();
                        return;
                    }
                    $("#form-public-chat-create input[name=chat_nm]").val("");
                    recentlyCreatedChatId = result;
                    $("#lobby-public-chat-create").foundation('close');
                    $("#lobby-public-chat-create-complete").foundation('open');
            }
        },
        error: function (request, status, error) {
            alert("An error has occurred making the request: " + error);
        }
    });
}

function doCreatePrivateChat() {
    $("#form-private-chat-create .form-error").hide();
    let chatName = $("#form-private-chat-create input[name=chat_nm]").val().trim();
    if (!chatName) {
        $("#form-private-chat-create .form-error.chat-name-required").show();
        $("#form-private-chat-create input[name=chat_nm]").focus();
        return;
    }
    $.ajax({
        url: '/private',
        type: 'post',
        dataType: 'json',
        data: {
            chat_nm: chatName
        },
        success: function (result) {
            recentlyCreatedChatId = null;
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
                    recentlyCreatedChatId = result;
                    let url = "https://chatinue.com/private/" + result;
                    $("#form-private-chat-create input[name=chat_nm]").val("");
                    $("#lobby-private-chat-create").foundation('close');
                    $("#lobby-private-chat-create-complete").foundation('open');
                    let oldText = $("#lobby-private-chat-create-complete .copy-to-clipboard").data("old-text");
                    if (oldText) {
                        $("#lobby-private-chat-create-complete .copy-to-clipboard").text(oldText).removeClass("alert");
                    }
                    $("#lobby-private-chat-create-complete .private-chat-url").text(url);
            }
        },
        error: function (request, status, error) {
            alert("An error has occurred making the request: " + error);
        }
    });
}

let refreshChatsTimer;
function refreshChats(chatLang, recursable) {
    if (refreshChatsTimer) {
        clearTimeout(refreshChatsTimer);
        refreshChatsTimer = null;
    }
    if (chatLang) {
        $(".chats-options select[name=chat_lang] option").filter(function () {
            return $(this).val() === chatLang;
        }).each(function () {
            $(".chats-options select[name=chat_lang]").val(chatLang);
        });
    } else {
        chatLang = $(".chats-options select[name=chat_lang]").val();
    }
    refreshChatsTimer = setTimeout(function () {
        $.ajax({
            url: '/lobby/chats',
            data: {
                lang_cd: chatLang
            },
            type: 'get',
            dataType: 'json',
            success: function (list) {
                if (!list || !list.length) {
                    if (recursable && chatLang !== "en") {
                        $(".no-chats .button.start").hide();
                        setTimeout(function () {
                            sessionStorage.setItem("chatLang", "en");
                            refreshChats("en", false);
                        }, 1500);
                    } else {
                        $(".no-chats .button.start").show();
                    }
                    $(".chats .chat:visible").remove();
                    $(".chats").hide();
                    $(".no-chats").fadeIn();
                    return;
                }
                $(".no-chats").hide();
                $(".chats").show();
                $(".chats .chat:visible").remove();
                for (let i in list) {
                    let chatInfo = list[i];
                    let chat = $(".chats .chat.template").clone().removeClass("template");
                    chat.data("chat-id", chatInfo.chatId);
                    chat.find("a").attr("href", "/chats/" + chatInfo.chatId);
                    chat.find("h5").text(chatInfo.chatName);
                    chat.find(".curr-users span").text(chatInfo.currentUsers);
                    if (chatInfo.currentUsers > 0) {
                        chat.addClass("active");
                    }
                    if (chatInfo.pastDays >= 2) {
                        chat.find(".new").hide();
                    }
                    chat.appendTo($(".chats")).hide().fadeIn();
                }
            },
            error: function () {
                location.reload();
            }
        });
    }, 10);
}