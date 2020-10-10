function ChatMonitor(chatClientSettings) {
    let chatMonitor = this;
    let available = false;
    let socket;
    let heartbeatTimer;
    let heartbeatCount = 0;
    let rooms = [];

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
            token = chatClientSettings.admissionToken;
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
                let chatMessage = deserialize(event.data);
                chatMonitor.handleMessage(chatMessage);
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

    this.handleMessage = function (chatMessage) {
        Object.getOwnPropertyNames(chatMessage).forEach(function (val, idx, array) {
            let payload = chatMessage[val];
            console.log(val, payload);
            if (payload) {
                switch (val) {
                    case "heartBeat": {
                        if (payload === "-pong-") {
                            chatMonitor.heartbeatPing();
                        }
                        break;
                    }
                    default: {
                        if (payload.content && payload.content.startsWith("usersByCountry:")) {
                            let usersByCountry = deserialize(payload.content.substring(15));
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
        let roomId = payload.roomId||"log";
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
        let message = $("<p class='message'/>");
        if (payload.chater) {
            let chater = deserialize(payload.chater);
            let sender = $("<span class='sender'/>")
                .text(chater.username)
                .attr("title", chater.description);
            if (chater.color) {
                sender.addClass("my-col-" + chater.color);
            }
            let content = $("<span class='content'/>")
                .text(payload.content);
            message.data("user-no", chater.userNo)
                .data("username", chater.username)
                .append(sender)
                .append(content);
            if (chater.country) {
                let flag = $("<img class='flag'/>");
                flag.attr("src", "/assets/flags/" + chater.country.toLowerCase() + ".svg");
                flag.attr("title", countryNames[chater.country]);
                message.prepend(flag);
            }
            if (isEvent) {
                message.addClass("event");
            }
        } else {
            $("<span class='content'/>")
                .text(payload.content)
                .appendTo(message);
        }
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local().format("LTS");
            $("<span class='datetime'/>").text(datetime).appendTo(message);
        }
        return message;
    };

    this.touchRoom = function (roomId) {
        if (!rooms[roomId]) {
            let monitor = $(".monitor");
            let room = $(".room").eq(0).hide().clone();
            room.data("room-id", roomId);
            room.addClass("available");
            room.find("h4").text(roomId);
            room.data("tailing", true);
            room.find(".tailing-status").addClass("on");
            if (roomId === "log") {
                $(".monitor .room").eq(0).after(room);
            } else {
                room.appendTo(".monitor");
            }
            if (monitor.hasClass("tiled") || $(".room:visible").length === 0) {
                room.show();
            }
            let cellSize = monitor.data("cell-size");
            if (cellSize) {
                room.addClass(cellSize);
            }
            let tab = $(".tabs-title").eq(0).hide().clone();
            tab.data("room-id", roomId);
            tab.find(".title").text(roomId);
            tab.addClass("available");
            if (roomId === "log") {
                $(".monitor .tabs-title").eq(0).after(tab);
            } else {
                tab.appendTo(".tabs");
            }
            tab.show();
            if ($(".tabs-title:visible").length === 1) {
                $(".tabs-title.available").removeClass("is-active").eq(0).addClass("is-active");
            }
            setTimeout(function () {
                chatMonitor.updateRoomName(roomId, room, tab);
            }, 1);
            rooms[roomId] = room;
            return room
        } else {
            return rooms[roomId];
        }
    };

    this.removeRoom = function (roomId) {
        let room;
        $(".room").filter(function () {
            return $(this).data("room-id") === roomId;
        }).each(function () {
            room = $(this).hide();
        });
        let tab;
        $(".tabs-title").filter(function () {
            return $(this).data("room-id") === roomId;
        }).each(function () {
            tab = $(this).hide();
        });
        if (!$(".monitor").hasClass("tiled")) {
            if (room) {
                if (!room.prev(".room.available").show().length) {
                    room.next(".room.available").show();
                }
            }
            if (tab) {
                if (!tab.prev(".tabs-title.available").addClass("is-active").show().length) {
                    tab.next(".tabs-title.available").addClass("is-active").show();
                }
            }
        }
        if (room) {
            room.remove();
        }
        if (tab) {
            tab.remove();
        }
        rooms[roomId] = null;
    };

    this.updateRoomName = function (roomId, room, tab) {
        if (roomId === "log") {
            let roomName = "Events";
            room.find("h4").text(roomName);
            tab.find(".title").text(roomName).attr("title", roomId);
            return;
        } else if (roomId.startsWith("str:")) {
            let roomName = "Stranger Chat (" + roomId + ")";
            room.find("h4").text(roomName);
            tab.find(".title").text(roomName).attr("title", roomId);
            return;
        } else if (roomId.startsWith("pri:")) {
            tab.addClass("private");
        } else if (roomId.indexOf(":") !== -1) {
            let roomName = "Exchange Chat (" + roomId + ")";
            room.find("h4").text(roomName);
            tab.find(".title").text(roomName).attr("title", roomId);
            return;
        }
        $.ajax({
            url: '/admin/monitor/getRoomName',
            data: {
                roomId: roomId
            },
            type: 'get',
            dataType: 'text',
            success: function (roomName) {
                if (roomName) {
                    room.find("h4").text(roomName);
                    tab.find(".title").text(roomName).attr("title", roomId);
                }
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
                let tab = $(".tabs-title.available.is-active");
                let roomId = tab.data("room-id");
                if (roomId) {
                    rooms.each(function () {
                       if ($(this).data("room-id") === roomId) {
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
        let roomId = tab.data("room-id");
        tab.addClass("is-active");
        $(".room.available").each(function () {
            if ($(this).data("room-id") === roomId) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    $(".monitor").delegate(".room.available .status-bar .remove-room", "click", function() {
        let room = $(this).closest(".room");
        let roomId = room.data("room-id");
        chatMonitor.removeRoom(roomId);
    });
    $(".monitor").delegate(".room.available .status-bar .tailing-switch", "click", function() {
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