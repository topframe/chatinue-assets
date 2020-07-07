let chatClient;

$(function () {
    if (!checkSignedIn()) {
        $("#message").blur();
        $("#message, #form-send-message button").prop("disabled", true);
        return false;
    }
    chatClient = new ChatClientCore(chatClientSettings);
    if (!chatClient.init()) {
        return;
    }
    chatClient.readyToType();
});