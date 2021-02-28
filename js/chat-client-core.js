function ChatClientCore(chatClientSettings) {
    let chatClient = this;
    let available = false;
    let socket;
    let heartbeatTimer;
    let heartbeatCount = 0;
    let pendedMessages;
    let frequentlySentCount = 0;
    let chatAborted;
    let justStayHere;

    this.init = function (extender) {
        if (!Modernizr.websockets || detectIE()) {
            chatClient.gotoHome();
            return false;
        }
        if (extender) {
            extender(this);
        }
        $("button.sign-out").off().click(function () {
            $("button.sign-out").prop("disabled", true);
            chatClient.closeSocket();
            setTimeout(function () {
                location.href = "/sign-out";
            }, 900);
        });
        $("button.leave").on("click", function () {
            $("button.leave").prop("disabled", true);
            chatClient.closeSocket();
            setTimeout(function () {
                chatClient.leaveRoom();
            }, 500);
        });
        $("#contacts").on("click", ".contact", function () {
            $(".description", this).toggle();
        }).on("mouseleave", ".contact", function () {
            $(".description", this).hide();
        });
        $("#convo").on("click", ".message.event.group .more", function () {
            $(this).parent().toggleClass("all-visible");
        });
        $("#message").on("focusin", function () {
            hideSidebar();
        });
        $("#form-send-message").submit(function () {
            if (!socket || !$("#message").val()) {
                return false;
            }
            if (frequentlySentCount > 1) {
                return false;
            }
            $("#for-automata-clear").focus();
            if (userInfo.userNo) {
                chatClient.sendMessage();
            }
            frequentlySentCount++;
            $("#form-send-message button.send").addClass("busy");
            if (isTouchDevice()) {
                $("#form-send-message button.send").focus().blur();
            }
            setTimeout(function () {
                $("#form-send-message button.send").removeClass("busy");
            }, 500);
            setTimeout(function () {
                frequentlySentCount--;
            }, 1000);
            return false;
        });
        if (chatClientSettings.admissionToken && chatClientSettings.autoConnectEnabled !== false) {
            setTimeout(function () {
                chatClient.openSocket(chatClientSettings.admissionToken);
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
            chatClient.gotoHome();
            return;
        }
        chatClient.closeSocket();
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
            let chatMessage = {
                message: {
                    type: 'JOIN',
                    userNo: userInfo.userNo,
                    username: userInfo.username
                }
            };
            chatClient.sendMessage(serialize(chatMessage));
            chatClient.heartbeatPing();
        };
        socket.onmessage = function (event) {
            if (typeof event.data === "string") {
                let chatMessage = deserialize(event.data);
                chatClient.handleMessage(chatMessage);
            }
        };
        socket.onclose = function (event) {
            if (chatAborted) {
                chatClient.closeSocket();
                if (!justStayHere) {
                    chatClient.gotoHome();
                }
            } else {
                chatClient.closeSocket();
                chatClient.checkConnection(100);
            }
        };
        socket.onerror = function (event) {
            console.error("WebSocket error observed:", event);
            chatClient.closeSocket();
            chatClient.checkConnection(100);
        };
    };

    this.heartbeatPing = function () {
        if (heartbeatTimer) {
            clearTimeout(heartbeatTimer);
        }
        heartbeatTimer = setTimeout(function () {
            if (socket) {
                let chatMessage = {
                    heartBeat: "-ping-"
                };
                chatClient.sendMessage(serialize(chatMessage));
                chatClient.heartbeatPing();
                if (chatClientSettings.pingPerHeartbeats) {
                    heartbeatCount++;
                    if (heartbeatCount % chatClientSettings.pingPerHeartbeats === 0) {
                        $.ajax({
                            url: '/ping',
                            type: 'get',
                            dataType: 'text',
                            success: function (result) {
                                if (result !== "pong") {
                                    chatClient.leaveRoom();
                                }
                            },
                            error: function () {
                                chatClient.leaveRoom();
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
                        chatClient.reloadPage();
                    } else {
                        chatClient.gotoHome();
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
                    chatClient.checkConnection(2000 * retries);
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

    this.leaveRoom = function (force) {
        chatClient.closeSocket();
        chatClient.gotoHome();
    };

    this.handleMessage = function (chatMessage) {
        if (pendedMessages) {
            pendedMessages.push(chatMessage);
            return;
        }
        Object.getOwnPropertyNames(chatMessage).forEach(function (val, idx, array) {
            let payload = chatMessage[val];
            if (payload) {
                switch (val) {
                    case "heartBeat": {
                        if (payload === "-pong-") {
                            chatClient.heartbeatPing();
                        }
                        break;
                    }
                    case "broadcast": {
                        chatClient.printMessage(payload);
                        break;
                    }
                    case "userJoined": {
                        chatClient.addChater(deserialize(payload.chater));
                        chatClient.printUserJoinedMessage(payload);
                        break;
                    }
                    case "userLeft": {
                        chatClient.removeChater(payload.userNo);
                        chatClient.printUserLeftMessage(payload);
                        break;
                    }
                    case "join": {
                        pendedMessages = [];
                        chatClient.setChaters(payload.chaters);
                        if (payload.recentConvo) {
                            chatClient.printRecentConvo(payload.recentConvo);
                        }
                        let chater = deserialize(payload.chater);
                        chatClient.printJoinMessage(chater);
                        while (pendedMessages && pendedMessages.length > 0) {
                            chatClient.handleMessage(pendedMessages.pop());
                        }
                        pendedMessages = null;
                        break;
                    }
                    case "abort": {
                        chatAborted = true;
                        justStayHere = false;
                        switch (payload.cause) {
                            case "exists":
                                alert("Username already in use. Please sign in again.");
                                chatClient.leaveRoom(true);
                                break;
                            case "rejoin":
                                justStayHere = true;
                                chatClient.clearChaters();
                                chatClient.clearConvo();
                                chatClient.closeSocket();
                                $("#chat-duplicate-join").foundation('open');
                                break;
                            default:
                                justStayHere = true;
                                chatClient.serviceNotAvailable();
                        }
                        break;
                    }
                }
            }
        });
    };

    this.readyToType = function (select) {
        if (select) {
            $("#message").focus().select();
        } else {
            $("#message").focus();
        }
    };

    this.sendMessage = function (message) {
        if (message) {
            socket.send(message);
            return;
        }
        let $msg = $("#message");
        let content = $msg.val().trim();
        if (content) {
            let chatMessage = {
                message: {
                    type: 'POST',
                    userNo: userInfo.userNo,
                    username: userInfo.username,
                    content: content
                }
            };
            $msg.val('');
            socket.send(serialize(chatMessage));
            $msg.focus();
        }
    };

    this.setChaters = function (chaters) {
        if (chaters) {
            for (let i in chaters) {
                let str = chaters[i];
                let index = str.indexOf(':');
                if (index > -1) {
                    let chater = deserialize(str.substring(index + 1));
                    chatClient.addChater(chater);
                }
            }
            chatClient.updateTotalPeople();
        }
    };

    this.addChater = function (chater) {
        let contact = $("<li class='contact'/>")
            .data("user-no", chater.userNo)
            .data("username", chater.username)
            .data("color", chater.color);
        let status = $("<div/>").addClass("status");
        if (chater.color) {
            status.addClass("my-col-" + chater.color);
        }
        let badge = $("<i class='iconfont fi-mountains'/>");
        let name = $("<p class='name'/>").text(chater.username);
        contact.append(status.append(badge)).append(name);
        if (chater.description) {
            let description = $("<p class='description'/>").text(chater.description);
            contact.append(description);
            contact.addClass("has-description");
        }
        contact.appendTo($("#contacts"));
        if (chater.country) {
            let flag = $("<img class='flag'/>");
            flag.attr("src", chatClientSettings.cdnAssetsUrl + "/flags/" + chater.country.toLowerCase() + ".svg");
            flag.attr("title", chater.country);
            contact.append(flag);
        }
        if (userInfo.userNo === chater.userNo) {
            contact.addClass("me");
        }
        chatClient.updateTotalPeople();
    };

    this.removeChater = function (userNo) {
        chatClient.findUser(userNo).remove();
        chatClient.updateTotalPeople();
    };

    this.findUser = function (userNo) {
        return $("#contacts .contact")
            .filter(function () {
                return ($(this).data("user-no") === userNo);
            });
    };

    this.clearChaters = function () {
        $("#contacts").empty();
        chatClient.updateTotalPeople();
    };

    this.clearConvo = function () {
        $("#convo").empty();
    };

    this.removeConvoMessages = function () {
        $("#convo .message").remove();
    };

    this.getTotalPeople = function () {
        return $("#contacts .contact").length;
    };

    this.updateTotalPeople = function () {
        let total = chatClient.getTotalPeople();
        if (total) {
            $("#totalPeople").text(total).fadeIn();
        } else {
            $("#totalPeople").text("").hide();
        }
    };

    this.printJoinMessage = function (chater, restored) {
        let welcomeMsg = replaceMessageArguments(chatClientMessages.welcome, "username", chater.username);
        chatClient.printEventMessage(welcomeMsg, restored);
    };

    this.printUserJoinedMessage = function (payload, restored) {
        chatClient.printUserEvent(payload, "user-joined", restored);
    };

    this.printUserLeftMessage = function (payload, restored) {
        chatClient.printUserEvent(payload, "user-left", restored);
    };

    this.printUserEvent = function (payload, event, restored) {
        let convo = $("#convo");
        let last = convo.find(".message").last();
        let container = null;
        if (last.length) {
            let userNo = last.data("user-no");
            if (last.hasClass("event") && payload.userNo === userNo) {
                container = last;
            }
        }
        let chater = deserialize(payload.chater);
        let content = $("<p class='content'/>").addClass(event).data("event", event);
        switch (event) {
            case "user-joined":
                content.append(replaceMessageArguments(chatClientMessages.userJoined, "username", chater.username));
                break;
            case "user-left":
                content.append(replaceMessageArguments(chatClientMessages.userLeft, "username", chater.username));
                break;
            default:
                console.error("Unknown user event: " + event);
                return;
        }
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local().format("L LT");
            content.append("<span class='datetime'>" + datetime + "</span>");
        }
        if (container) {
            let contents = container.find(".content");
            if (contents.length >= 30) {
                contents.first().remove();
            }
            container.addClass("group").append(content);
            contents = container.find(".content").addClass("omitted");
            let first = contents.first();
            let last = contents.last();
            if (first.data("event") !== last.data("event")) {
                first.removeClass("omitted");
            }
            last.removeClass("omitted");
            if (contents.length > 2) {
                let more = container.find(".more");
                if (more.length > 0) {
                    more.attr("title", contents.length)
                } else {
                    $("<i class='more fi-indent-more'></i>").attr("title", contents.length).insertAfter(first);
                }
            }
        } else {
            let message = $("<div class='message event'/>")
                .data("user-no", payload.userNo)
                .append(content);
            if (!restored && chater.description && event === "user-joined") {
                let selfIntro = $("<p class='self-introduction'/>").text(chater.description);
                if (chater.color) {
                    selfIntro.addClass("my-col-" + chater.color);
                }
                message.append(selfIntro);
            }
            convo.append(message);
        }
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printMessage = function (payload, restored) {
        let chater = deserialize(payload.chater);
        let convo = $("#convo");
        let content = $("<p class='content'/>").text(payload.content);
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local();
            let hours = moment.duration(moment().diff(datetime)).asHours();
            content.append("<span class='datetime'>" +
                datetime.format(hours < 24 ? "LTS" : "L LT") + "</span>");
        }
        let last = convo.find(".message").last();
        if (last.length && !last.hasClass("event") && last.data("user-no") === chater.userNo) {
            if (restored) {
                last.addClass("restored");
            }
            last.append(content);
        } else {
            let myself = (userInfo.userNo === chater.userNo);
            let sender = $("<span class='username'/>").text(chater.username);
            let message = $("<div/>")
                .addClass(myself ? "message sent" : "message received")
                .data("user-no", chater.userNo)
                .data("username", chater.username)
                .append(sender).append(content);
            if (restored) {
                message.addClass("restored");
            } else if (chater.color) {
                message.addClass("my-col-" + chater.color);
            }
            convo.append(message);
        }
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printEventMessage = function (html, restored) {
        let convo = $("#convo");
        let content = $("<p class='content'/>").html(html);
        $("<div class='message event'/>")
            .append(content)
            .appendTo(convo);
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printCustomMessage = function (content) {
        let convo = $("#convo");
        $("<div class='message custom'/>")
            .append(content)
            .appendTo(convo);
        chatClient.scrollToBottom(convo);
    };

    this.printRecentConvo = function (chatMessages) {
        for (let i in chatMessages) {
            let chatMessage = chatMessages[i];
            Object.getOwnPropertyNames(chatMessage).forEach(function (val, idx, array) {
                let payload = chatMessage[val];
                if (payload) {
                    switch (val) {
                        case "broadcast": {
                            chatClient.printMessage(payload, true);
                            break;
                        }
                        case "userJoined": {
                            chatClient.printUserJoinedMessage(payload, true);
                            break;
                        }
                        case "userLeft": {
                            chatClient.printUserLeftMessage(payload, true);
                            break;
                        }
                    }
                }
            });
        }
        chatClient.scrollToBottom($("#convo"), false);
    };

    this.scrollToBottom = function (container, animate) {
        if (animate) {
            container.animate({scrollTop: container.prop("scrollHeight")});
        } else {
            container.scrollTop(container.prop("scrollHeight"));
        }
    };

    this.reloadPage = function () {
        location.reload();
    };

    this.gotoHome = function () {
        if (chatClientSettings.homepage) {
            location.href = chatClientSettings.homepage;
        }
    };

    this.serviceNotAvailable = function () {
        openNoticePopup(chatClientMessages.systemError,
            chatClientMessages.serviceNotAvailable,
            function () {
                chatClient.gotoHome();
            });
    };
}