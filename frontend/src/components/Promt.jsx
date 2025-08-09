import axios from "axios";
import { ArrowUp, Bot, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow as codeTheme } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

import logo from "../../public/logo.jpeg";

function Promt() {
  const [imageFile, setImageFile] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [typeMessage, setTypeMessage] = useState("");
  const [promt, setPromt] = useState([]);
  const [loading, setLoading] = useState(false);
  const promtEndRef = useRef();

  const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      const storedPromt = localStorage.getItem(`promtHistory_${user._id}`);
      if (storedPromt) {
        setPromt(JSON.parse(storedPromt));
      }
    }
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      localStorage.setItem(`promtHistory_${user._id}`, JSON.stringify(promt));
    }
  }, [promt]);

  useEffect(() => {
    promtEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [promt, loading]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed && !imageFile) return;

    setInputValue("");
    setTypeMessage(trimmed);
    setLoading(true);

    const localImageUrl = imageFile ? URL.createObjectURL(imageFile) : null;
    console.log("Local Image URL:", localImageUrl);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("content", trimmed);
      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_SIZE) {
          alert("Image too large, max 15 MB");
          setLoading(false);
          setTypeMessage(null);
          return;
        }
        console.log("Appending file:", imageFile);
        formData.append("file", imageFile);
        for (let [key, value] of formData.entries()) {
          console.log(`FormData: ${key} =`, value);
        }
      }

      const { data } = await axios.post(
        "http://localhost:3000/api/v1/deepseekai/promt",
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          withCredentials: true,
        }
      );

      console.log("API Response Image URL:", data.imageUrl);
      setPromt((prev) => [
        ...prev,
        {
          role: "user",
          content: trimmed || "[Image]",
          imageUrl: localImageUrl,
        },
        { role: "assistant", content: data.reply },
      ]);
      setImageFile(null);
      document.getElementById("fileInput").value = null;
    } catch (error) {
      console.error("API Error:", error);
      let errorMessage = "Failed to get AI response.";
      let responseImageUrl = null;
      if (error.response?.status === 400) {
        errorMessage = error.response.data.error || "Prompt too large or invalid input.";
        responseImageUrl = error.response.data.imageUrl || null;
        if (error.response.data.error.includes("Image extraction failed")) {
          errorMessage = "Image could not be processed. Ensure the image is valid.";
        } else if (error.response.data.error.includes("Image too large")) {
          errorMessage = "Image too large, max 15 MB.";
        } else if (error.response.data.error.includes("Image URL inaccessible")) {
          errorMessage = "Image URL is not publicly accessible.";
        }
      } else if (error.response?.status === 402) {
        errorMessage = "Prompt exceeds token limit. Try a smaller image or text.";
        responseImageUrl = error.response.data.imageUrl || null;
      }
      console.log("Error Response Image URL:", responseImageUrl);
      setPromt((prev) => [
        ...prev,
        {
          role: "user",
          content: trimmed || "[Image]",
          imageUrl: localImageUrl,
        },
        { role: "assistant", content: `❌ ${errorMessage}` },
      ]);
      setImageFile(null);
      document.getElementById("fileInput").value = null;
    } finally {
      setLoading(false);
      setTypeMessage(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    console.log("Selected file:", file);
    if (file && file.size <= MAX_IMAGE_SIZE) {
      setImageFile(file);
    } else {
      alert("Image too large, max 15 MB.");
      setImageFile(null);
      document.getElementById("fileInput").value = null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-between flex-1 w-full px-4 pb-4 md:pb-8">
      <div className="mt-8 md:mt-16 text-center">
        <div className="flex items-center justify-center gap-2">
          <img src={logo} alt="DeepSeek Logo" className="h-6 md:h-8" />
          <h1 className="text-2xl md:text-3xl font-semibold text-white mb-2">
            Hi, I'm Stock Buddy.
          </h1>
        </div>
        <p className="text-gray-400 text-base md:text-sm mt-2">
          💬 How can I help you today?
        </p>
      </div>

      <div className="w-full max-w-4xl flex-1 overflow-y-auto mt-6 mb-4 space-y-4 max-h-[60vh] px-1">
        {promt.map((msg, index) => (
          <div
            key={index}
            className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" ? (
              <div className="w-full bg-[#232323] text-white rounded-xl px-4 py-3 text-sm whitespace-pre-wrap">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={codeTheme}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg mt-2"
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code
                          className="bg-gray-800 px-1 py-0.5 rounded"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="w-[30%] bg-blue-600 text-white rounded-xl px-4 py-3 text-sm whitespace-pre-wrap">
                {msg.imageUrl && (
                  <>
                    {console.log("Rendering image:", msg.imageUrl, "Index:", index)}
                    <img
                      src={msg.imageUrl}
                      alt="Uploaded"
                      className="max-w-[200px] rounded mb-2"
                      onError={(e) => console.error("Image render error:", e, "URL:", msg.imageUrl)}
                    />
                  </>
                )}
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {loading && typeMessage && (
          <div className="whitespace-pre-wrap px-4 py-3 rounded-2xl text-sm break-words bg-blue-600 text-white ml-auto max-w-[40%]">
            {imageFile && (
              <img
                src={URL.createObjectURL(imageFile)}
                alt="Preview"
                className="max-w-[200px] rounded mb-2"
              />
            )}
            {typeMessage}
          </div>
        )}

        {loading && (
          <div className="flex justify-start w-full">
            <div className="bg-[#2f2f2f] text-white px-4 py-3 rounded-xl text-sm animate-pulse">
              🤖 Loading...
            </div>
          </div>
        )}

        <div ref={promtEndRef} />
      </div>

      <div className="w-full max-w-4xl relative mt-auto">
        <div className="bg-[#2f2f2f] rounded-[2rem] px-4 md:px-6 py-6 md:py-8 shadow-md">
          <input
            type="text"
            placeholder="💬 Message StockBuddy"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-transparent w-full text-white placeholder-gray-400 text-base md:text-lg outline-none"
            maxLength={1000}
          />
          {imageFile && (
            <div className="mt-2">
              <img
                src={URL.createObjectURL(imageFile)}
                alt="Preview"
                className="max-w-[100px] rounded"
              />
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4 gap-4">
            <div className="flex gap-2 flex-wrap">
              <button className="flex items-center gap-2 border border-gray-500 text-white text-sm md:text-base px-3 py-1.5 rounded-full hover:bg-gray-600 transition">
                <Bot className="w-4 h-4" />
                StockBuddy
              </button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label htmlFor="fileInput" className="cursor-pointer text-gray-400 hover:text-white transition">
                <Paperclip className="w-5 h-5" />
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="fileInput"
              />
              <button
                onClick={handleSend}
                className="bg-gray-500 hover:bg-blue-600 p-2 rounded-full text-white transition"
                disabled={loading}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Promt;