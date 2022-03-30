let chatClient;
let wrongPasscodeCount = 0;

$(function () {
    if (!checkSignedIn()) {
        $("#message").blur();
        $("#message, #form-send-message button").prop("disabled", true);
        return false;
    }
    if (chatClientSettings.secret) {
        $("#public-chat-enter-passcode .cancel").on("click", function () {
            location.href = "/";
        });
        $("#form-passcode").submit(function () {
            verifyPasscode();
            return false;
        });
    }
    chatClient = new ChatClientCore(chatClientSettings);
    if (chatClientSettings.secret && !chatClientSettings.talkerToken) {
        openPasscodePopup();
    } else {
        if (chatClient.init()) {
            chatClient.readyToType();
        }
    }
});

function openPasscodePopup() {
    $("#public-chat-enter-passcode").foundation('open');
    $("#form-passcode .form-error.incorrect-passcode").hide();
    $("#form-passcode input[name=passcode]").val("").focus();
}

function closePasscodePopup() {
    $("#public-chat-enter-passcode").foundation('close');
}

function verifyPasscode() {
    let passcode = $("#form-passcode input[name=passcode]").val().trim();
    if (!passcode || passcode.length !== 4) {
        $("#form-passcode input[name=passcode]").val("").focus();
        return false;
    }
    closePasscodePopup();
    openWaitPopup(modalMessages.signingIn, function () {
        location.reload();
    }, 10000);
    $.ajax({
        url: "/chats/" + chatClientSettings.chatId + "/verify",
        data: {
            passcode: passcode
        },
        method: 'POST',
        dataType: 'text',
        success: function (token) {
            setTimeout(function () {
                closeWaitPopup();
                if (!token) {
                    wrongPasscodeCount++;
                    if (wrongPasscodeCount > 3) {
                        chatClient.gotoHome();
                        return;
                    }
                    openPasscodePopup();
                    $("#form-passcode .form-error.incorrect-passcode").show();
                } else {
                    chatClientSettings.talkerToken = token;
                    if (chatClient.init()) {
                        chatClient.readyToType();
                    } else {
                        chatClient.gotoHome();
                    }
                }
            }, 500);
        },
        error: function (e) {
            console.error(e);
            closeWaitPopup();
            chatClient.serviceUnavailable();
        }
    });
}
