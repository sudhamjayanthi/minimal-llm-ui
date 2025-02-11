"use client";
import generateRandomString from "@/utils/generateRandomString";
import { cn } from "@/utils/cn";
import { ChatOllama } from "langchain/chat_models/ollama";
import { AIMessage, HumanMessage } from "langchain/schema";
import React, { useRef } from "react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { CopyIcon } from "@/components/icons/copy-icon";
import { TrashIcon } from "@/components/icons/trash-icon";
import AppNavbar from "@/components/app-navbar";
import { MenuToggle } from "@/components/menu-toggle";
import { motion, useCycle } from "framer-motion";
import { RightChevron } from "@/components/icons/right-chevron";

export default function Home() {
  const [newPrompt, setNewPrompt] = useState("");
  const [messages, setMessages] = useState<
    {
      type: string;
      id: any;
      timestamp: number;
      content: string;
      model?: string;
    }[]
  >([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [activeModel, setActiveModel] = useState<string>("");
  const [ollama, setOllama] = useState<ChatOllama>();
  const [conversations, setConversations] = useState<
    { title: string; filePath: string }[]
  >([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [menuState, toggleMenuState] = useCycle(false, true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef && textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current?.scrollHeight}px`;
      textareaRef.current.style.overflow = `${
        textareaRef?.current?.scrollHeight > 200 ? "auto" : "hidden"
      }`;
    }
  }, [newPrompt]);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation]);

  useEffect(() => {
    // Get models
    fetch("http://localhost:11434/api/tags")
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setAvailableModels(data.models);
        console.log(data.models[0]?.name);
        setActiveModel(data.models[0]?.name);
        const initOllama = new ChatOllama({
          baseUrl: "http://localhost:11434",
          model: data.models[0]?.name,
        });
        setOllama(initOllama);
      });

    // Get existing conversations
    getExistingConvos();
  }, []);

  async function getExistingConvos() {
    fetch("../api/fs/get-convos", {
      method: "POST", // or 'GET', 'PUT', etc.
      body: JSON.stringify({
        conversationPath: "./conversations",
      }),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
      },
    }).then((response) => {
      console.log(response),
        response.json().then((data) => setConversations(data));
    });
  }

  async function triggerPrompt() {
    if (!ollama) return;
    scrollToBottom();
    if (messages.length == 0) getName(newPrompt);
    const msg = {
      type: "human",
      id: generateRandomString(8),
      timestamp: Date.now(),
      content: newPrompt,
    };
    const model = activeModel;
    let streamedText = "";
    messages.push(msg);
    const msgCache = [...messages];
    const stream = await ollama.stream(
      messages.map((m) =>
        m.type == "human"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
    );
    setNewPrompt("");
    let updatedMessages = [...msgCache];
    let c = 0;
    for await (const chunk of stream) {
      streamedText += chunk.content;
      const aiMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: streamedText,
        model,
      };
      updatedMessages = [...msgCache, aiMsg];
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  async function persistConvo(messages: any[]) {
    let name = activeConversation;
    if (name == "") {
      name = (await getName(newPrompt)).trim();
      console.log(name.trim());
      setActiveConversation(name.trim());
    }

    fetch("../api/fs/persist-convo", {
      method: "POST", // or 'GET', 'PUT', etc.
      body: JSON.stringify({
        conversationPath: "./conversations",
        messages: messages,
        convoTitle: name.trim().replaceAll('"', ""),
        filename:
          name
            .toLowerCase()
            .replaceAll(" ", "_")
            .replaceAll(":", "-")
            .replaceAll('"', "") + ".json",
      }),
    }).then(() => getExistingConvos());
  }

  function loadConvo(conversation: { title: string; filePath: string }) {
    if (activeConversation == conversation.title) return;
    fetch("../api/fs/get-convo-by-path", {
      method: "POST",
      body: JSON.stringify({
        conversationPath: conversation.filePath,
      }),
    }).then((response) =>
      response.json().then((data) => {
        setMessages(data.messages);
        setActiveConversation(conversation.title);
      }),
    );
  }

  function deleteConvo(conversation: { title: string; filePath: string }) {
    fetch("../api/fs/delete-convo-by-path", {
      method: "POST",
      body: JSON.stringify({
        conversationPath: conversation.filePath,
      }),
    }).then((response) => {
      setConversations((prev) => [
        ...conversations.filter((c) => c.filePath !== conversation.filePath),
      ]);
      if (activeConversation == conversation.title) {
        loadConvo(conversations[0]);
      }
    });
  }

  function deleteMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    let filtered = messages.filter((m, i) => m.id != activeMsg.id);
    setMessages(() => filtered);
    persistConvo(filtered);
  }

  async function refreshMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    if (!ollama) return;
    let index =
      messages.findIndex((m) => m.id == activeMsg.id) -
      (activeMsg.type == "human" ? 0 : 1);
    let filtered = messages.filter((m, i) => index >= i);
    console.log("filtered", filtered);

    setMessages(() => filtered);
    // useEffect on change here if the last value was a human message?

    const model = activeModel;
    let streamedText = "";
    const msgCache = [...filtered];
    const stream = await ollama.stream(
      filtered.map((m) =>
        m.type == "human"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
    );
    setNewPrompt("");
    let updatedMessages = [...msgCache];
    let c = 0;
    for await (const chunk of stream) {
      streamedText += chunk.content;
      const aiMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: streamedText,
        model,
      };
      updatedMessages = [...msgCache, aiMsg];
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  const scrollToBottom = () => {
    if (msgContainerRef.current) {
      msgContainerRef.current.scrollTo({
        top: msgContainerRef.current.scrollHeight + 10000,
        behavior: "smooth",
      });
    }
  };

  function startNewChat() {
    setMessages([]);
    setActiveConversation("");
    setNewPrompt("");
    toggleMenuState();
  }

  function getName(input: string) {
    const nameOllama = new ChatOllama({
      baseUrl: "http://localhost:11434",
      model: "llama2",
      verbose: false,
    });
    return nameOllama!
      .predict(
        "You're a tool, that receives an input and responds exclusively with a 2-5 word summary of the topic (and absolutely no prose) based specifically on the words used in the input (not the expected output). Each word in the summary should be carefully chosen so that it's perfecly informative - and serve as a perfect title for the input. Now, return the summary for the following input:\n" +
          input,
      )
      .then((name) => name);
  }

  return (
    <main className="relative flex max-h-screen min-h-screen w-screen max-w-[100vw] items-center justify-between overflow-hidden">
      <motion.div
        className={cn("absolute left-0 top-0 z-50 p-3")}
        initial={false}
        animate={menuState ? "open" : "closed"}
      >
        <MenuToggle toggle={() => toggleMenuState()} />
      </motion.div>
      <motion.div
        layout
        className={cn(
          "flex max-h-screen min-h-screen flex-col overflow-x-visible border-r py-12",
          { "w-80 min-w-[20rem] border-white/10": menuState },
          { "-z-0 w-0 border-white/0": !menuState },
        )}
      >
        {menuState && (
          <motion.button
            onClick={startNewChat}
            whileTap={{ backgroundColor: "rgba(255,255,255,0.8)" }}
            whileHover={{ backgroundColor: "rgba(255,255,255,1)" }}
            className="flex cursor-pointer items-center justify-between bg-white/80 px-4 py-2 text-black"
          >
            <span className="text-xs font-semibold">New Chat</span>
            <RightChevron className="h-4 w-4 fill-black" />
          </motion.button>
        )}
        {menuState &&
          conversations.map((c) => (
            <div
              className="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-white/5"
              key={c.title}
              onClick={() => loadConvo(c)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">{c.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <CopyIcon className="h-4 w-4 fill-white/50 hover:fill-white/75" />
                <TrashIcon
                  onClick={() => deleteConvo(c)}
                  className="h-4 w-4 fill-white/50 hover:fill-white/75"
                />
              </div>
            </div>
          ))}
      </motion.div>
      <div
        className="flex max-h-screen min-h-screen w-full flex-col"
        style={{ maxWidth: "calc(100vw - " + (menuState ? 20 : 0) + "rem)" }}
      >
        <AppNavbar
          documentName={activeConversation}
          setDocumentName={() => {}}
          activeModel={activeModel}
          availableModels={availableModels}
          setActiveModel={setActiveModel}
          setOllama={setOllama}
        />
        <div className="flex w-full flex-1 flex-shrink flex-col items-center justify-end gap-y-4 overflow-hidden whitespace-break-spaces">
          <div className="flex w-full flex-1 flex-col items-center justify-end gap-y-4 overflow-scroll whitespace-break-spaces">
            <div
              ref={msgContainerRef}
              className="block h-fit w-full flex-col items-center justify-center gap-y-1 overflow-scroll rounded-md p-2"
            >
              {messages.map((msg) => (
                <div
                  key={"message-" + msg.id}
                  className={cn(
                    "flex h-fit max-w-[80%] cursor-pointer flex-col items-start gap-y-1 rounded-md px-2 py-1",
                    { "ml-auto": msg.type == "human" },
                    { "mr-auto": msg.type == "ai" },
                  )}
                >
                  <div
                    className={cn(
                      "flex h-fit max-w-full cursor-pointer flex-col items-center gap-y-1 rounded-md border border-[#191919] px-2 py-1",
                      { "ml-auto": msg.type == "human" },
                      { "mr-auto": msg.type == "ai" },
                    )}
                  >
                    <p className="mr-auto text-xs text-white/50">
                      {(msg?.model?.split(":")[0] || "user") +
                        " • " +
                        new Date(msg.timestamp).toLocaleDateString() +
                        " " +
                        new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                    <Markdown
                      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                      className={
                        "mr-auto flex w-full flex-col text-sm text-white"
                      }
                    >
                      {msg.content.trim()}
                    </Markdown>
                  </div>
                  <div
                    className={cn(
                      "my-2 flex gap-x-1",
                      { "ml-auto": msg.type == "human" },
                      { "mr-auto": msg.type == "ai" },
                    )}
                  >
                    <RefreshIcon
                      onClick={() => refreshMessage(msg)}
                      className="h-4 w-4 fill-white/50 hover:fill-white/75"
                    />
                    <CopyIcon
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                      }}
                      className="h-4 w-4 fill-white/50 hover:fill-white/75"
                    />
                    <TrashIcon
                      onClick={() => {
                        deleteMessage(msg);
                      }}
                      className="h-4 w-4 fill-white/50 hover:fill-white/75"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-4 flex max-h-[200px] min-h-[56px] w-full flex-shrink-0 resize-none appearance-none overflow-hidden rounded-md px-4 text-sm font-normal text-white outline-0 focus:outline-0 focus:ring-white/10 md:flex">
          <textarea
            ref={textareaRef}
            onChange={(e) => {
              if (e.target.value != "\n") setNewPrompt(e.target.value);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.metaKey &&
                !e.shiftKey &&
                !e.altKey &&
                newPrompt !== ""
              ) {
                triggerPrompt();
              } else if (
                e.key === "Enter" &&
                (e.metaKey || !e.shiftKey || !e.altKey)
              ) {
                console.log(e);
              }
            }}
            rows={1}
            className="flex max-h-[200px] w-full resize-none appearance-none rounded-md border border-[#191919] bg-[#0a0a0a]/80 px-6 py-4 text-sm font-normal text-white outline-0 focus:outline-0 focus:ring-white/10 md:flex"
            placeholder="Send a message"
            value={newPrompt}
          ></textarea>
        </div>
      </div>
    </main>
  );
}
