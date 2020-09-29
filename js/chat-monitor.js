function ChatMonitor(chatClientSettings) {
    let chatMonitor = this;
    let available = false;
    let socket;
    let heartbeatTimer;
    let heartbeatCount = 0;
    let chatAborted;
    let justStayHere;
    let rooms = [];

    this.init = function (extender) {
        if (!Modernizr.websockets || detectIE()) {
            chatMonitor.gotoHome();
            return false;
        }
        if (extender) {
            extender(this);
        }
        if (chatClientSettings.admissionToken && chatClientSettings.autoConnectEnabled !== false) {
            setTimeout(function () {
                chatMonitor.openSocket(chatClientSettings.admissionToken);
            }, 300);
        }
        available = true;
        return true;
    };

    this.isAvailable = function () {
        return available;
    };

    this.openSocket = function (token, params) {
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
            chatMonitor.heartbeatPing();
        };
        socket.onmessage = function (event) {
            if (typeof event.data === "string") {
                let chatMessage = deserialize(event.data);
                chatMonitor.handleMessage(chatMessage);
            }
        };
        socket.onclose = function (event) {
            if (chatAborted) {
                chatMonitor.closeSocket();
                if (!justStayHere) {
                    chatMonitor.gotoHome();
                }
            } else {
                chatMonitor.closeSocket();
                chatMonitor.checkConnection(100);
            }
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
                            url: '/ping',
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
                url: '/ping',
                type: 'get',
                dataType: 'text',
                timeout: 30000,
                success: function (result) {
                    if (result === "pong" && !chatAborted) {
                        chatMonitor.reloadPage();
                    } else {
                        chatMonitor.gotoHome();
                    }
                },
                error: function () {
                    let retries = $("#common-connection-lost").data("retries") || 0;
                    $("#common-connection-lost").data("retries", retries + 1);
                    if (retries === 0) {
                        $("#common-connection-lost").foundation('open');
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

    this.handleMessage = function (chatMessage) {
        Object.getOwnPropertyNames(chatMessage).forEach(function (val, idx, array) {
            let payload = chatMessage[val];
            if (payload) {
                switch (val) {
                    case "heartBeat": {
                        if (payload === "-pong-") {
                            chatMonitor.heartbeatPing();
                        }
                        break;
                    }
                    default: {
                        console.log(val, payload);
                        chatMonitor.printMessage(val, payload);
                        break;
                    }
                }
            }
        });
    };

    this.sendMessage = function (message) {
        socket.send(message);
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
        if (!payload.chater) {
            return false;
        }
        let roomId = payload.roomId;
        let room = chatMonitor.touchRoom(roomId);
        let convo = room.find(".convo");
        switch (type) {
            case "userJoined":
                payload.content = "has entered.";
                chatMonitor.makeMessage(payload, true).appendTo(convo);
                break;
            case "userLeft":
                payload.content = "has left.";
                chatMonitor.makeMessage(payload, true).appendTo(convo);
                break;
            default:
                chatMonitor.makeMessage(payload).appendTo(convo);
        }
        if (room.data("tailing")) {
            chatMonitor.scrollToBottom(convo);
        }
    };

    this.makeMessage = function (payload, isEvent) {
        let chater = deserialize(payload.chater);
        let sender = $("<span class='sender'/>")
            .text(chater.username)
            .attr("title", chater.description);
        if (chater.color) {
            sender.addClass("my-col-" + chater.color);
        }
        let content = $("<span class='content'/>")
            .text(payload.content);
        let message = $("<p class='message'/>")
            .data("user-no", chater.userNo)
            .data("username", chater.username)
            .append(sender)
            .append(content);
        if (isEvent) {
            message.addClass("event");
        }
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local().format("L LT");
            message.append("<span class='datetime'>" + datetime + "</span>");
        }
        return message;
    };

    this.touchRoom = function (roomId) {
        if (!rooms[roomId]) {
            let monitor = $(".monitor");
            let room = $(".room").eq(0).hide().clone();
            room.data("room-id", roomId);
            room.addClass("available");
            room.appendTo(".monitor");
            room.find("h4").text(roomId);
            room.data("tailing", true);
            room.find(".tailing-status").addClass("on");
            if (monitor.hasClass("tiled") || $(".room:visible").length === 0) {
                room.show();
            }
            let cellSize = monitor.data("cell-size");
            if (cellSize) {
                room.addClass(cellSize);
            }
            let tab = $(".tabs-title").eq(0).hide().clone();
            tab.data("index", $(".tabs-title.available").length);
            tab.data("room-id", roomId);
            tab.find(".title").text(roomId);
            tab.addClass("available");
            tab.appendTo(".tabs").show();
            if ($(".tabs-title:visible").length === 1) {
                $(".tabs-title.available").removeClass("is-active").eq(0).addClass("is-active");
            }
            setTimeout(function () {
                chatMonitor.getRoomName(roomId);
            }, 1);
            rooms[roomId] = room;
            return room
        } else {
            return rooms[roomId];
        }
    };

    this.getRoomName = function (roomId) {
        $.ajax({
            url: '/admin/monitor/getRoomName',
            data: {
                roomId: roomId
            },
            type: 'get',
            dataType: 'text',
            success: function (roomName) {
                $(".room").filter(function () {
                    return $(this).data("room-id") === roomId;
                }).each(function () {
                    $(this).find("h4").text(roomName);
                });
                $(".tabs-title").filter(function () {
                    return $(this).data("room-id") === roomId;
                }).each(function () {
                    $(this).find(".title").text(roomName);
                });
            },
            error: function () {
                alert("Failed to get room name");
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
        let rooms = $(".room.available");
        let columns = $(this).parent().data("columns");
        switch (columns) {
            case 1:
                monitor.addClass("tiled").data("cell-size", "");
                rooms.removeClass("large-3 large-4 large-6");
                break;
            case 2:
                monitor.addClass("tiled").data("cell-size", "large-6");
                rooms.removeClass("large-3 large-4 large-6").addClass("large-6");
                break;
            case 3:
                monitor.addClass("tiled").data("cell-size", "large-4");
                rooms.removeClass("large-3 large-4 large-6").addClass("large-4");
                break;
            default:
                monitor.removeClass("tiled").data("cell-size", "");
                rooms.removeClass("large-3 large-4 large-6");
                let index = $(".tabs-title.available.is-active").data("index");
                rooms.hide().eq(index).show();
                break;
        }
    });

    $(".tabs").delegate(".tabs-title.available a", "click", function() {
        $(".tabs-title").removeClass("is-active");
        let tab = $(this).closest(".tabs-title");
        let index = tab.data("index");
        tab.addClass("is-active");
        $(".room.available").hide().eq(index).show();
    });
    $(".monitor").delegate(".room .status-bar .clear-screen", "click", function() {
        $(this).closest(".room").find(".convo").empty();
    });
    $(".monitor").delegate(".room .status-bar .tailing-switch", "click", function() {
        let room = $(this).closest(".room");
        if (room.data("tailing")) {
            room.data("tailing", false);
            $(this).find(".tailing-status").removeClass("on");
        } else {
            room.data("tailing", true);
            $(this).find(".tailing-status").addClass("on");
            chatMonitor.scrollToBottom(room.find(".convo"));
        }
    });
});