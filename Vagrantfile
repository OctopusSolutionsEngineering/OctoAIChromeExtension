# This Vagrantfile sets up a secure, isolated environment for running the GitHub Copilot CLI and related tools.
# It is used to execute the agent workflows that update the Spinnaker conversion system prompt and prompt-based project creation system prompt.
# for example
# for i in {1..10}
#  do
#    cat /home/vagrant/Code/OctoAIChromeExtension/.github/prompts/project-creation.prompt.md | copilot \
#      --allow-all-tools \
#      --allow-all-paths
#  done

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"

  # Disable the default /vagrant synced folder
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # Synced folders
  config.vm.synced_folder "/Users/matthewcasperson/.copilot", "/home/vagrant/.copilot"
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctoAIChromeExtension/dashboards/spinnaker", "/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker"
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctoAIChromeExtension/.github/prompts/", "/home/vagrant/Code/OctoAIChromeExtension/.github/prompts/", mount_options: ["ro"]
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctopusCopilot/context", "/home/vagrant/Code/OctopusCopilot/context", mount_options: ["ro"]
  config.vm.synced_folder "/Users/matthewcasperson/Downloads/spinnaker-pipelines-vendor-anonymized", "/home/vagrant/Downloads/spinnaker-pipelines-vendor-anonymized", mount_options: ["ro"]

  config.vm.provider "parallels" do |prl|
    prl.memory = 4096
    prl.cpus   = 2
  end

  # ── Credential injection (run: always to pick up token rotations) ────────────
  # File is owned by root, mode 600 — the vagrant user cannot read it directly.
  # The token is injected into the agent process at launch time by the wrapper below.
  # Note: this token is scoped only to the GitHub Copilot CLI and cannot be used
  # for any other GitHub API purpose.
  github_copilot_token = ENV.fetch('GITHUB_COPILOT_TOKEN') do
    raise "GITHUB_COPILOT_TOKEN is not set on the host. " \
          "Export it before running vagrant up:\n" \
          "  export GITHUB_COPILOT_TOKEN='your-token-here'"
  end

  config.vm.provision "shell", run: "always", inline: <<-SHELL
    echo "export GH_TOKEN='#{github_copilot_token}'" > /etc/github_copilot_token.env
    chown root:root /etc/github_copilot_token.env
    chmod 600 /etc/github_copilot_token.env
  SHELL

  config.vm.provision "shell", inline: <<-SHELL
    set -euo pipefail

    mkdir /home/vagrant/Scratchpad

    apt-get update -y

    apt-get upgrade -y

    # ── Base tools ──────────────────────────────────────────────────────────────
    apt-get install -y \
      auditd \
      curl \
      docker.io \
      git \
      jq \
      python3 \
      screen \
      ufw

    usermod -aG docker vagrant

    # ── Node.js (LTS via NodeSource) ────────────────────────────────────────────
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs

    # ── GitHub Copilot CLI ─────────────────────────────────────────────────────
    npm install -g @github/copilot

    # ── Qwen Code settings ──────────────────────────────────────────────────────
    mkdir -p /home/vagrant/.qwen
    cat > /home/vagrant/.qwen/settings.json <<'EOF'
{
  "security": {
    "auth": {
      "selectedType": "openai",
      "apiKey": "DUMMY_PASSWORD",
      "baseUrl": "http://10.211.55.2:11434/v1"
    }
  },
  "model": {
    "name": "qwen3.6:35b-a3b-coding-mxfp8"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6:35b-a3b-coding-mxfp8",
        "name": "Qwen 3.6 (Local)",
        "baseUrl": "http://localhost:11434/v1",
        "envKey": "OLLAMA_DUMMY_KEY"
      }
    ]
  },
  "$version": 3
}
EOF
    chown -R vagrant:vagrant /home/vagrant/.qwen

    # ── Qwen Code (LLaMA 3-based code generation model) ─────────────────────────────
    npm install -g @qwen-code/qwen-code

    # ── GitHub CLI ──────────────────────────────────────────────────────────────
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -y
    apt-get install -y gh

    # ── Disable bash history for all users ─────────────────────────────────────
    echo "set +o history" >> /etc/bash.bashrc
    echo "HISTFILE=" >> /etc/environment

    # ── Firewall (UFW) ──────────────────────────────────────────────────────────
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow in 22/tcp comment 'SSH'
    ufw --force enable

    # ── auditd: log access to sensitive files and privileged commands ───────────
    cat > /etc/audit/rules.d/aiagent.rules <<'AUDIT'
# Credential file access
-w /etc/github_copilot_token.env -p rwxa -k credential_access
# Sudo and su usage
-w /usr/bin/sudo -p x -k sudo_exec
-w /bin/su -p x -k su_exec
# Identity file changes
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k sudoers_change
-w /etc/sudoers.d/ -p wa -k sudoers_change
AUDIT
    augenrules --load
    systemctl enable auditd
    systemctl restart auditd

    # ── Remove sudo access from the vagrant user ────────────────────────────────
    # This must be the last step in provisioning — all prior apt-get/usermod
    # commands above require sudo and must complete before this is applied.
    deluser vagrant sudo || true
    # Belt-and-suspenders: explicitly deny via sudoers even if re-added to group
    echo "vagrant ALL=(ALL) !ALL" > /etc/sudoers.d/deny-vagrant
    chmod 440 /etc/sudoers.d/deny-vagrant

    echo "──────────────────────────────────────"
    echo "git     : $(git --version)"
    echo "jq      : $(jq --version)"
    echo "curl    : $(curl --version | head -1)"
    echo "node    : $(node --version)"
    echo "npm     : $(npm --version)"
    echo "gh      : $(gh --version | head -1)"
    echo "──────────────────────────────────────"
  SHELL
end

