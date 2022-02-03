function ChatMonitor(chatClientSettings) {
    let chatMonitor = this;
    let available = false;
    let socket;
    let heartbeatTimer;
    let heartbeatCount = 0;
    let chats = [];

    this.init = function (extender) {
        if (!Modernizr.websockets || detectIE()) {
            chatMonitor.gotoHome();
            return false;
        }
        if (extender) {
            extender(this);
        }
        if (chatClientSettings.autoConnectEnabled !== false) {
            chatMonitor.checkConnection(100);
        }
        available = true;
        return true;
    };

    this.isAvailable = function () {
        return available;
    };

    this.openSocket = function (token, params) {
        if (!token) {
            token = chatClientSettings.talkerToken;
        }
        if (!token || token.length > 100) {
            chatMonitor.gotoHome();
            return;
        }
        chatMonitor.closeSocket();
        let url = new URL(chatClientSettings.serverEndpoint + token + location.search, location.href);
        if (params) {
            for (let key in params) {
                url.searchParams.set(key, params[key]);
            }
        }
        url.protocol = url.protocol.replace('https:', 'wss:');
        url.protocol = url.protocol.replace('http:', 'ws:');
        socket = new WebSocket(url.href);
        socket.onopen = function (event) {
            console.log("Websocket is opened");
            chatMonitor.heartbeatPing();
        };
        socket.onmessage = function (event) {
            if (typeof event.data === "string") {
                let message = deserialize(event.data);
                chatMonitor.handleMessage(message);
            }
        };
        socket.onclose = function (event) {
            console.log("Websocket is closed", event);
            chatMonitor.closeSocket();
            if (event.reason) {
                alert(event.reason);
            }
            chatMonitor.checkConnection(100);
        };
        socket.onerror = function (event) {
            console.error("WebSocket error observed:", event);
            chatMonitor.closeSocket();
            chatMonitor.checkConnection(100);
        };
    };

    this.heartbeatPing = function () {
        if (heartbeatTimer) {
            clearTimeout(heartbeatTimer);
        }
        heartbeatTimer = setTimeout(function () {
            if (socket) {
                chatMonitor.sendMessage("-ping-");
                chatMonitor.heartbeatPing();
                if (chatClientSettings.pingPerHeartbeats) {
                    heartbeatCount++;
                    if (heartbeatCount % chatClientSettings.pingPerHeartbeats === 0) {
                        $.ajax({
                            url: '/admin/ping',
                            type: 'get',
                            dataType: 'text',
                            success: function (result) {
                                if (result !== "pong") {
                                    chatMonitor.stop();
                                }
                            },
                            error: function () {
                                chatMonitor.stop();
                            }
                        });
                    }
                }
            }
        }, 57000);
    };

    this.checkConnection = function (delay) {
        setTimeout(function () {
            $.ajax({
                url: '/admin/monitor/getToken',
                type: 'get',
                dataType: 'text',
                timeout: 30000,
                success: function (token) {
                    if (token) {
                        $("#connection-lost").foundation('close');
                        chatMonitor.openSocket(token);
                    } else {
                        chatMonitor.gotoHome();
                    }
                },
                error: function () {
                    let retries = $("#connection-lost").data("retries") || 0;
                    $("#connection-lost").data("retries", retries + 1);
                    if (retries === 0) {
                        $("#connection-lost").foundation('open');
                    } else if (retries > 25) {
                        console.log("Abandon reconnection");
                        return;
                    }
                    console.log(retries + " retries");
                    chatMonitor.checkConnection(2000 * retries);
                }
            });
        }, delay);
    };

    this.closeSocket = function () {
        if (socket) {
            socket.onclose = null;
            socket.close();
            socket = null;
        }
    };

    this.stop = function () {
        chatMonitor.closeSocket();
        chatMonitor.gotoHome();
    };

    this.handleMessage = function (message) {
        Object.getOwnPropertyNames(message).forEach(function (val, idx, array) {
            let payload = message[val];
            console.log(val, payload);
            if (payload) {
                switch (val) {
                    case "heartbeat": {
                        if (payload === "-pong-") {
                            chatMonitor.heartbeatPing();
                        }
                        break;
                    }
                    default: {
                        if (payload.text && payload.text.startsWith("usersByCountry:")) {
                            let usersByCountry = deserialize(payload.text.substring(15));
                            drawUsersByCountry(usersByCountry);
                        } else {
                            chatMonitor.printMessage(val, payload);
                        }
                        break;
                    }
                }
            }
        });
    };

    this.sendMessage = function (text) {
        socket.send(text);
    };

    this.scrollToBottom = function (container) {
        container.scrollTop(container.prop("scrollHeight"));
    };

    this.reloadPage = function () {
        location.reload();
    };

    this.gotoHome = function () {
        if (chatClientSettings.homepage) {
            location.href = chatClientSettings.homepage;
        }
    };

    this.printMessage = function (type, payload) {
        let chatId = payload.chatId||"log";
        let chat = chatMonitor.touchChat(chatId);
        let convo = chat.find(".convo");
        switch (type) {
            case "userJoined":
                payload.text = "has entered.";
                chatMonitor.makeMessage(payload, true).appendTo(convo);
                break;
            case "userLeft":
                payload.text = "has left.";
                chatMonitor.makeMessage(payload, true).appendTo(convo);
                break;
            default:
                chatMonitor.makeMessage(payload).appendTo(convo);
        }
        if (chat.data("tailing")) {
            chatMonitor.scrollToBottom(convo);
        }
    };

    this.makeMessage = function (payload, isEvent) {
        let message = $("<p class='message'/>");
        if (payload.talker) {
            let talker = deserialize(payload.talker);
            let sender = $("<span class='sender'/>")
                .text(talker.userName)
                .attr("title", talker.aboutMe);
            if (talker.color) {
                sender.addClass("my-col-" + talker.color);
            }
            let content = $("<span class='content'/>")
                .text(payload.text);
            message.data("user-id", talker.userId)
                .data("user-name", talker.userName)
                .append(sender)
                .append(content);
            if (talker.country) {
                let flag = $("<img class='flag'/>");
                flag.attr("src", "/assets/flags/" + talker.country.toLowerCase() + ".svg");
                flag.attr("title", countryNames[talker.country]);
                message.prepend(flag);
            }
            if (isEvent) {
                message.addClass("event");
            }
        } else {
            $("<span class='content'/>")
                .text(payload.text)
                .appendTo(message);
        }
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local().format("LTS");
            $("<span class='datetime'/>").text(datetime).appendTo(message);
        }
        return message;
    };

    this.touchChat = function (chatId) {
        if (!chats[chatId]) {
            let monitor = $(".monitor");
            let chat = $(".chat").eq(0).hide().clone();
            chat.data("chat-id", chatId);
            chat.addClass("available");
            chat.find("h4").text(chatId);
            chat.data("tailing", true);
            chat.find(".tailing-status").addClass("on");
            if (chatId === "log") {
                $(".monitor .chat").eq(0).after(chat);
            } else {
                chat.appendTo(".monitor");
            }
            if (monitor.hasClass("tiled") || $(".chat:visible").length === 0) {
                chat.show();
            }
            let cellSize = monitor.data("cell-size");
            if (cellSize) {
                chat.addClass(cellSize);
            }
            let tab = $(".tabs-title").eq(0).hide().clone();
            tab.data("chat-id", chatId);
            tab.find(".title").text(chatId);
            tab.addClass("available");
            if (chatId === "log") {
                $(".monitor .tabs-title").eq(0).after(tab);
            } else {
                tab.appendTo(".tabs");
            }
            tab.show();
            if ($(".tabs-title:visible").length === 1) {
                $(".tabs-title.available").removeClass("is-active").eq(0).addClass("is-active");
            }
            setTimeout(function () {
                chatMonitor.updateChatName(chatId, chat, tab);
            }, 1);
            chats[chatId] = chat;
            return chat
        } else {
            return chats[chatId];
        }
    };

    this.removeChat = function (chatId) {
        let chat;
        $(".chat").filter(function () {
            return $(this).data("chat-id") === chatId;
        }).each(function () {
            chat = $(this).hide();
        });
        let tab;
        $(".tabs-title").filter(function () {
            return $(this).data("chat-id") === chatId;
        }).each(function () {
            tab = $(this).hide();
        });
        if (!$(".monitor").hasClass("tiled")) {
            if (chat) {
                if (!chat.prev(".chat.available").show().length) {
                    chat.next(".chat.available").show();
                }
            }
            if (tab) {
                if (!tab.prev(".tabs-title.available").addClass("is-active").show().length) {
                    tab.next(".tabs-title.available").addClass("is-active").show();
                }
            }
        }
        if (chat) {
            chat.remove();
        }
        if (tab) {
            tab.remove();
        }
        chats[chatId] = null;
    };

    this.updateChatName = function (chatId, chat, tab) {
        if (chatId === "log") {
            let chatName = "Events";
            chat.find("h4").text(chatName);
            tab.find(".title").text(chatName).attr("title", chatId);
            return;
        }
        $.ajax({
            url: '/admin/monitor/getChatName',
            data: {
                chatId: chatId
            },
            type: 'get',
            dataType: 'text',
            success: function (chatName) {
                if (chatName) {
                    chat.find("h4").text(chatName);
                    tab.find(".title").text(chatName).attr("title", chatId);
                }
            },
            error: function () {
                alert("Failed to get chat name");
            }
        });
    }
}

$(function () {
    let chatMonitor = new ChatMonitor(chatClientSettings);
    chatMonitor.init();

    $(".layout-options li a").on("click", function() {
        $(".layout-options li").removeClass("on");
        $(this).parent().addClass("on");
        let monitor = $(".monitor");
        let chats = $(".chat.available");
        let columns = $(this).parent().data("columns");
        switch (columns) {
            case 1:
                monitor.addClass("tiled").data("cell-size", "");
                chats.removeClass("large-3 large-4 large-6");
                break;
            case 2:
                monitor.addClass("tiled").data("cell-size", "large-6");
                chats.removeClass("large-3 large-4 large-6").addClass("large-6");
                break;
            case 3:
                monitor.addClass("tiled").data("cell-size", "large-4");
                chats.removeClass("large-3 large-4 large-6").addClass("large-4");
                break;
            default:
                monitor.removeClass("tiled").data("cell-size", "");
                chats.removeClass("large-3 large-4 large-6");
                let tab = $(".tabs-title.available.is-active");
                let chatId = tab.data("chat-id");
                if (chatId) {
                    chats.each(function () {
                       if ($(this).data("chat-id") === chatId) {
                           $(this).show();
                       } else {
                           $(this).hide();
                       }
                    });
                }
                break;
        }
    });
    $(".tabs").delegate(".tabs-title.available a", "click", function() {
        $(".tabs-title").removeClass("is-active");
        let tab = $(this).closest(".tabs-title");
        let chatId = tab.data("chat-id");
        tab.addClass("is-active");
        $(".chat.available").each(function () {
            if ($(this).data("chat-id") === chatId) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    $(".monitor").delegate(".chat.available .status-bar .remove-chat", "click", function() {
        let chat = $(this).closest(".chat");
        let chatId = chat.data("chat-id");
        chatMonitor.removeChat(chatId);
    });
    $(".monitor").delegate(".chat.available .status-bar .tailing-switch", "click", function() {
        let chat = $(this).closest(".chat");
        if (chat.data("tailing")) {
            chat.data("tailing", false);
            $(this).find(".tailing-status").removeClass("on");
        } else {
            chat.data("tailing", true);
            $(this).find(".tailing-status").addClass("on");
            chatMonitor.scrollToBottom(chat.find(".convo"));
        }
    });
});