Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"

  # Disable the default /vagrant synced folder
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # Synced folders
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctoAIChromeExtension/dashboards/spinnaker", "/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker"
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctoAIChromeExtension/.github/prompts/", "/home/vagrant/Code/OctoAIChromeExtension/.github/prompts/", mount_options: ["ro"]
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctopusCopilot/context", "/home/vagrant/Code/OctopusCopilot/context", mount_options: ["ro"]
  config.vm.synced_folder "/Users/matthewcasperson/Downloads/spinnaker-pipelines-vendor-anonymized", "/home/vagrant/Downloads/spinnaker-pipelines-vendor-anonymized", mount_options: ["ro"]

  config.vm.provider "parallels" do |prl|
    prl.memory = 4096
    prl.cpus   = 2
  end

  # ── Credential injection (run: always to pick up token rotations) ────────────
  # File is owned by root, mode 600 — the aiagent user cannot read it directly.
  # The token is injected into the agent process at launch time by the wrapper below.
  # Note: this token is scoped only to the GitHub Copilot CLI and cannot be used
  # for any other GitHub API purpose.
  config.vm.provision "shell", run: "always", inline: <<-SHELL
    echo "export GH_TOKEN='#{ENV['GITHUB_COPILOT_TOKEN']}'" > /etc/github_copilot_token.env
    chown root:root /etc/github_copilot_token.env
    chmod 600 /etc/github_copilot_token.env
  SHELL

  config.vm.provision "shell", inline: <<-SHELL
    set -euo pipefail

    apt-get update -y

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

